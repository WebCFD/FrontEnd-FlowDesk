#!/bin/bash
# Wrapper script to set TMPDIR before starting server
# This avoids /tmp disk quota issues in Replit

export TMPDIR=/home/runner/workspace/.tmp_inductiva
export TEMP=$TMPDIR
export TMP=$TMPDIR
export TSX_CACHE_DIR=$TMPDIR/tsx
export XDG_CACHE_HOME=$TMPDIR

mkdir -p "$TMPDIR"
mkdir -p "$TSX_CACHE_DIR"

exec npm run dev
