#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
[ "$#" -eq 0 ] || exit 64
exec /bin/bash /Users/lsb/AI-Brain/niannian-ai-canonical-local/bridge/mac-employee-training/Run-NianNian-Step01-HQ-Composite.command
