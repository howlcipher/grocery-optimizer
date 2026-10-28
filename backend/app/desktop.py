"""Desktop runtime runner for Grocery Optimizer.

Launches the application server locally on 127.0.0.1, auto-selects an available
port, opens the user's default web browser, and cleanly manages shutdown.
Stores household data in standard Linux XDG paths (~/.local/share/grocery-optimizer/).
"""

import argparse
import os
import signal
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Force desktop standalone mode
os.environ["GROCERY_OPTIMIZER_DESKTOP"] = "1"
os.environ["STANDALONE"] = "1"


def find_available_port(start_port: int = 8000, max_tries: int = 20) -> int:
    """Find an unbound localhost port starting from start_port."""
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            # Try to bind to test availability
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port


def print_banner(port: int, db_path: Path) -> None:
    print("\n" + "=" * 65)
    print("   🛒 Grocery Optimizer — Personal Price Hunter (Linux Release)")
    print("=" * 65)
    print(f"   ▶ Web Interface:   http://127.0.0.1:{port}")
    print(f"   ▶ Database (XDG):  {db_path}")
    print("   ▶ Retailers:       Kroger & Meijer Household Comparison")
    print("   ▶ Data Privacy:    100% Local (No external cloud uploads)")
    print("=" * 65)
    print("   Press Ctrl+C at any time to close Grocery Optimizer.\n")


def open_browser_later(url: str, delay_seconds: float = 1.0) -> None:
    """Open user's default browser after a short delay allowing server startup."""
    def _open():
        time.sleep(delay_seconds)
        try:
            webbrowser.open(url)
        except (webbrowser.Error, OSError):
            pass  # Non-fatal if headless or browser unavailable

    t = threading.Thread(target=_open, daemon=True)
    t.start()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Launch Grocery Optimizer desktop application server on Linux."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Specify local port to listen on (defaults to next available port >= 8000)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not automatically open the default web browser on launch",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Custom database data directory (defaults to ~/.local/share/grocery-optimizer)",
    )
    args = parser.parse_args()

    if args.data_dir:
        os.environ["XDG_DATA_HOME"] = args.data_dir

    import uvicorn

    from app.config import get_xdg_data_dir
    from app.main import app

    port = args.port or find_available_port(8000)
    db_file = get_xdg_data_dir() / "grocery_optimizer.db"

    print_banner(port, db_file)

    if not args.no_browser and not os.environ.get("HEADLESS"):
        open_browser_later(f"http://127.0.0.1:{port}")

    # Set up clean signal handling
    def handle_signal(sig, frame):
        print("\nShutting down Grocery Optimizer cleanly...")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
