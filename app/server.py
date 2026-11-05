"""
FastAPI Server for Spotify Swipe
Handles Spotify OAuth, Playlists, Track Discovery, Audio Proxy, and Static UI.
"""

import os
import sys
import urllib.parse
from typing import Dict, Any, List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests

from app.spotify_client import spotify_client

app = FastAPI(title="Spotify Swipe — Playlist Maker")

# Allow local CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active session state for current swiped session
current_session: Dict[str, Any] = {
    "playlist_id": None,
    "playlist_name": "My Spotify Playlist",
    "playlist_url": None,
    "swiped_right": [],
    "swiped_left": []
}


class CreatePlaylistRequest(BaseModel):
    name: str
    description: Optional[str] = "Created with Spotify Swipe"
    public: Optional[bool] = True


class AddTrackRequest(BaseModel):
    playlist_id: Optional[str] = None
    track_uri: str
    track_id: Optional[str] = None
    name: Optional[str] = None
    artist: Optional[str] = None
    cover_art: Optional[str] = None


class SelectPlaylistRequest(BaseModel):
    playlist_id: str
    playlist_name: str
    playlist_url: Optional[str] = None


class RemoveTrackRequest(BaseModel):
    playlist_id: str
    track_uri: str
    track_id: Optional[str] = None


class DeduplicatePlaylistRequest(BaseModel):
    playlist_id: str


# ---------------------------- Auth Endpoints ---------------------------- #

@app.get("/auth/login")
async def auth_login():
    """Redirect to Spotify OAuth authorization page."""
    auth_url = spotify_client.get_authorize_url()
    return RedirectResponse(url=auth_url)


@app.get("/callback")
async def auth_callback(code: Optional[str] = None, error: Optional[str] = None):
    """Callback endpoint for Spotify OAuth redirect."""
    if error:
        return RedirectResponse(url=f"/?auth_error={urllib.parse.quote(error)}")
    if not code:
        return RedirectResponse(url="/?auth_error=missing_code")

    try:
        spotify_client.exchange_code(code)
        return RedirectResponse(url="/?auth_success=1")
    except Exception as e:
        print(f"[Auth Error] {e}")
        return RedirectResponse(url=f"/?auth_error={urllib.parse.quote(str(e))}")


@app.get("/api/auth/status")
async def auth_status():
    """Returns current Spotify user profile if authenticated."""
    user = spotify_client.get_current_user()
    if user:
        return {
            "authenticated": True,
            "user": {
                "id": user.get("id"),
                "display_name": user.get("display_name", "Spotify User"),
                "email": user.get("email"),
                "avatar": user.get("images", [{}])[0].get("url") if user.get("images") else None,
                "product": user.get("product", "free"),
                "spotify_url": user.get("external_urls", {}).get("spotify")
            }
        }
    return {
        "authenticated": False,
        "user": None
    }


@app.post("/api/auth/logout")
async def auth_logout():
    """Logs out and clears saved tokens."""
    spotify_client.clear_tokens()
    return {"status": "logged_out"}


# ---------------------------- Playlist Endpoints ---------------------------- #

@app.get("/api/playlists")
async def get_playlists():
    """Get the current user's existing playlists."""
    playlists = spotify_client.get_user_playlists(limit=50)
    return {"playlists": playlists}


@app.post("/api/playlist/create")
async def create_playlist_endpoint(req: CreatePlaylistRequest):
    """Create a new playlist on the user's Spotify account."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Playlist name is required.")

    try:
        playlist = spotify_client.create_playlist(
            name=req.name.strip(),
            description=req.description or "Created with Spotify Swipe",
            public=req.public if req.public is not None else True
        )
        playlist_id = playlist.get("id")
        playlist_url = playlist.get("url") or playlist.get("external_urls", {}).get("spotify", "")

        current_session["playlist_id"] = playlist_id
        current_session["playlist_name"] = req.name.strip()
        current_session["playlist_url"] = playlist_url
        current_session["swiped_right"] = []

        return {
            "status": "success",
            "playlist": {
                "id": playlist_id,
                "name": req.name.strip(),
                "url": playlist_url,
                "tracks_total": 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/playlist/select")
async def select_playlist_endpoint(req: SelectPlaylistRequest):
    """Select an existing playlist as the target for swiped tracks."""
    current_session["playlist_id"] = req.playlist_id
    current_session["playlist_name"] = req.playlist_name
    current_session["playlist_url"] = req.playlist_url or f"https://open.spotify.com/playlist/{req.playlist_id}"
    current_session["swiped_right"] = []

    details = spotify_client.get_playlist_details(req.playlist_id)
    return {
        "status": "selected",
        "session": current_session,
        "details": details
    }


@app.get("/api/playlist/{playlist_id}/details")
async def get_playlist_details_endpoint(playlist_id: str):
    """Fetch all tracks and duration details for an existing playlist."""
    details = spotify_client.get_playlist_details(playlist_id)
    return details


@app.post("/api/playlist/add-track")
async def add_track_endpoint(req: AddTrackRequest):
    """Add a track to the active playlist."""
    playlist_id = req.playlist_id or current_session.get("playlist_id")

    # Record in swiped_right list for UI tracking
    track_item = {
        "uri": req.track_uri,
        "id": req.track_id,
        "name": req.name or "Track",
        "artist": req.artist or "Artist",
        "cover_art": req.cover_art or ""
    }
    current_session["swiped_right"].append(track_item)

    if playlist_id:
        try:
            spotify_client.add_track_to_playlist(playlist_id, req.track_uri)
            return {
                "status": "added",
                "playlist_id": playlist_id,
                "total_swiped": len(current_session["swiped_right"]),
                "tracks": current_session["swiped_right"]
            }
        except Exception as e:
            # Still record swiped track even if Spotify API returned error
            return {
                "status": "saved_locally",
                "message": f"Saved locally (Spotify sync: {e})",
                "total_swiped": len(current_session["swiped_right"]),
                "tracks": current_session["swiped_right"]
            }

    return {
        "status": "saved_locally",
        "total_swiped": len(current_session["swiped_right"]),
        "tracks": current_session["swiped_right"]
    }


@app.post("/api/playlist/remove-track")
async def remove_track_endpoint(req: RemoveTrackRequest):
    """Remove an individual track from a Spotify playlist."""
    try:
        success = spotify_client.remove_track_from_playlist(req.playlist_id, req.track_uri)
        # Also remove from current_session tracks if present
        current_session["swiped_right"] = [
            t for t in current_session.get("swiped_right", [])
            if t.get("uri") != req.track_uri and t.get("id") != req.track_id
        ]
        return {"status": "removed" if success else "failed", "playlist_id": req.playlist_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/playlist/deduplicate")
async def deduplicate_endpoint(req: DeduplicatePlaylistRequest):
    """Scan and delete all duplicate tracks from a playlist in one click."""
    try:
        result = spotify_client.deduplicate_playlist(req.playlist_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/playlist/session")
async def get_session():
    """Get active session details and all swiped tracks."""
    return current_session


class PlaySpotifyRequest(BaseModel):
    track_uri: str
    device_id: Optional[str] = None


@app.get("/api/spotify/devices")
async def spotify_devices_endpoint():
    """Fetch active Spotify playback devices (e.g. desktop app, phone, web)."""
    devices = spotify_client.get_user_devices()
    return {"devices": devices}


@app.post("/api/spotify/play")
async def spotify_play_endpoint(req: PlaySpotifyRequest):
    """Start playback of track directly on active Spotify device."""
    success = spotify_client.play_on_spotify(req.track_uri, req.device_id)
    return {"status": "playing" if success else "failed"}


@app.post("/api/spotify/pause")
async def spotify_pause_endpoint(device_id: Optional[str] = None):
    """Pause playback on Spotify device."""
    success = spotify_client.pause_spotify(device_id)
    return {"status": "paused" if success else "failed"}


class LaunchAppRequest(BaseModel):
    playlist_id: Optional[str] = None


@app.post("/api/spotify/launch-app")
async def launch_spotify_app_endpoint(req: LaunchAppRequest):
    """
    Boots up the Spotify desktop application on the system and navigates
    directly to the specified playlist (or active user profile).
    """
    playlist_id = req.playlist_id or spotify_client.active_playlist.get("id")
    uri = f"spotify:playlist:{playlist_id}" if playlist_id else "spotify:"
    web_url = f"https://open.spotify.com/playlist/{playlist_id}" if playlist_id else "https://open.spotify.com"
    
    launched = False
    if sys.platform == "win32":
        try:
            os.startfile(uri)
            launched = True
        except Exception:
            try:
                import subprocess
                subprocess.Popen(["cmd", "/c", "start", uri], shell=True)
                launched = True
            except Exception:
                pass
                
    return {
        "status": "success",
        "launched": launched,
        "uri": uri,
        "web_url": web_url,
        "playlist_id": playlist_id
    }


# ---------------------------- Discovery Endpoints ---------------------------- #

@app.get("/api/discover")
async def discover_endpoint(
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=10),
    exclude_ids: Optional[str] = Query(None)
):
    """Fetch a deck of songs to swipe through."""
    try:
        excludes = [x.strip() for x in exclude_ids.split(",") if x.strip()] if exclude_ids else None
        tracks = spotify_client.discover_tracks(exclude_ids=excludes, offset=offset, limit=limit)
        return {
            "offset": offset,
            "count": len(tracks),
            "tracks": tracks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/search")
async def search_endpoint(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=50)):
    """Search tracks by query."""
    try:
        tracks = spotify_client.search_tracks(query_str=q, limit=limit)
        return {
            "query": q,
            "count": len(tracks),
            "tracks": tracks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------- Audio Proxy for Web Audio API ---------------------------- #

@app.get("/api/proxy-audio")
async def proxy_audio_endpoint(url: str = Query(..., description="External preview audio URL")):
    """
    Proxies audio streams with explicit CORS headers.
    Ensures Web Audio API AudioContext & AnalyserNode can process frequency data
    without any browser cross-origin policy blockage.
    """
    try:
        res = requests.get(url, stream=True, timeout=10)
        content_type = res.headers.get("Content-Type", "audio/mpeg")
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Content-Type": content_type,
            "Accept-Ranges": "bytes"
        }
        if "Content-Length" in res.headers:
            headers["Content-Length"] = res.headers["Content-Length"]

        def iter_stream():
            for chunk in res.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(iter_stream(), headers=headers, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to proxy audio: {e}")


# ---------------------------- Static Files Mount ---------------------------- #

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
