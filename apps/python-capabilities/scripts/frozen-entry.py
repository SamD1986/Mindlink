"""PyInstaller entrypoint for the bundled MindLink MCP capability."""

import sys

VERSION = "__MINDLINK_CAPABILITY_VERSION__"

if "--version" in sys.argv:
    print(VERSION)
else:
    from mindlink_echo_mcp.server import main

    main()
