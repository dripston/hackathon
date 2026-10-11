"""Make the ``app`` package importable when running ``pytest`` from the repo.

Kept at the project root (next to ``app/``) so the package is on ``sys.path``
regardless of the working directory pytest is launched from.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
