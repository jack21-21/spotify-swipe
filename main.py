"""
Spotify Swipe Desktop Application Launcher
Runs FastAPI backend on port 8888 (matching Spotify redirect URI)
and opens a native frameless liquid-glass window via pywebview (with browser fallback).
Configures Windows AppUserModelID and Taskbar icon from volt-viz icon.ico.
"""

import os
import sys
import time
import socket
import threading
import subprocess
import webbrowser
import ctypes

# Set explicit Application User Model ID for Windows Taskbar Icon grouping
try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("perma.spotify.swipe.playlistmaker.1")
except Exception:
    pass

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_DIR)
sys.path.insert(0, PROJECT_DIR)

PORT = 8888
URL = f"http://127.0.0.1:{PORT}"
ICON_PATH = os.path.join(PROJECT_DIR, "icon.ico")
if not os.path.exists(ICON_PATH):
    ICON_PATH = os.path.join(PROJECT_DIR, "app", "static", "assets", "icon.ico")

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.15)
        return s.connect_ex(('127.0.0.1', port)) == 0

def run_uvicorn():
    try:
        import uvicorn
        import app.server
        print(f"[Backend] Starting Uvicorn on 127.0.0.1:{PORT}...")
        uvicorn.run(app.server.app, host="127.0.0.1", port=PORT, log_level="warning", access_log=False)
    except Exception as e:
        print(f"[Backend Error] {e}")

class WindowAPI:
    def __init__(self):
        self._maximized = False

    def minimize(self):
        try:
            import webview
            if webview.windows:
                webview.windows[0].minimize()
        except Exception:
            pass

    def toggle_maximize(self):
        try:
            import webview
            if webview.windows:
                w = webview.windows[0]
                if self._maximized:
                    w.restore()
                    self._maximized = False
                else:
                    w.maximize()
                    self._maximized = True
        except Exception:
            pass

    def close(self):
        try:
            import webview
            if webview.windows:
                webview.windows[0].destroy()
        except Exception:
            pass
        os._exit(0)

    def resize(self, width: int, height: int):
        try:
            import webview
            if webview.windows:
                webview.windows[0].resize(int(width), int(height))
        except Exception:
            pass

def set_win32_window_icon(icon_file: str):
    """Ensures the Windows taskbar and window header receive the 32x32 and 16x16 icon."""
    try:
        user32 = ctypes.windll.user32
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1

        for _ in range(15):
            time.sleep(0.3)
            hwnd = user32.FindWindowW(None, "Spotify Swipe — Playlist Maker")
            if hwnd:
                hicon_big = user32.LoadImageW(None, icon_file, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
                hicon_small = user32.LoadImageW(None, icon_file, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
                if hicon_big:
                    user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
                if hicon_small:
                    user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)

                # Enable native window sizing borders on Windows for frameless window
                try:
                    GWL_STYLE = -16
                    WS_THICKFRAME = 0x00040000
                    SWP_FRAMECHANGED = 0x0020
                    SWP_NOMOVE = 0x0002
                    SWP_NOSIZE = 0x0001
                    SWP_NOZORDER = 0x0004
                    style = user32.GetWindowLongW(hwnd, GWL_STYLE)
                    user32.SetWindowLongW(hwnd, GWL_STYLE, style | WS_THICKFRAME)
                    user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED)
                except Exception:
                    pass
                break
    except Exception:
        pass

def fallback_browser_launch():
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for path in chrome_paths:
        if os.path.exists(path):
            try:
                subprocess.Popen([path, f"--app={URL}", "--window-size=1180,860"])
                print(f"[Launcher] Launched standalone window using: {path}")
                return
            except Exception:
                pass
    
    print(f"[Launcher] Opening in default web browser: {URL}")
    webbrowser.open(URL)

def main():
    print("=" * 60)
    print("  Spotify Swipe — Playlist Maker & Visualizer")
    print(f"  URL: {URL}")
    print("=" * 60)

    # Start FastAPI server in background thread if not already running
    if not is_port_in_use(PORT):
        server_thread = threading.Thread(target=run_uvicorn, daemon=True)
        server_thread.start()

        start_time = time.time()
        while not is_port_in_use(PORT):
            time.sleep(0.1)
            if time.time() - start_time > 10:
                print("[Launcher] Timeout waiting for backend to start.")
                break
    else:
        print(f"[Backend] Port {PORT} is already in use, reusing running instance.")

    # Try pywebview native frameless liquid window
    try:
        import webview
        api = WindowAPI()

        window = webview.create_window(
            title="Spotify Swipe — Playlist Maker",
            url=URL,
            js_api=api,
            width=1180,
            height=860,
            min_size=(800, 600),
            resizable=True,
            frameless=True,
            easy_drag=False,
            background_color='#060609'
        )
        threading.Thread(target=set_win32_window_icon, args=(ICON_PATH,), daemon=True).start()

        print("[Launcher] Starting pywebview GUI with taskbar icon...")
        webview.start(debug=False, icon=ICON_PATH if os.path.exists(ICON_PATH) else None)
    except Exception as e:
        print(f"[Launcher] pywebview GUI unavailable ({e}), falling back to browser window...")
        fallback_browser_launch()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")

if __name__ == "__main__":
    main()
