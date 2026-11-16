#!/bin/sh
# Provision the menu's build tools locally (including in Workers Builds), then build the pinned source.
set -eu
ENGINE=$(cd "$(dirname "$0")" && pwd)
TOOLS=$ENGINE/.work/tools
mkdir -p "$TOOLS"
NODE_VERSION=25.9.0
os=$(uname -s | tr 'A-Z' 'a-z')
arch=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')
archive=node-v$NODE_VERSION-$os-$arch.tar.gz
if [ ! -x "$TOOLS/${archive%.tar.gz}/bin/node" ]; then
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$archive" -o "$TOOLS/$archive"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TOOLS/SHASUMS256.txt"
    (cd "$TOOLS"; grep "  $archive\$" SHASUMS256.txt | shasum -a 256 -c -)
    tar xzf "$TOOLS/$archive" -C "$TOOLS"
fi
if [ ! -x "$TOOLS/emsdk/emsdk" ]; then
    git init "$TOOLS/emsdk"
    git -C "$TOOLS/emsdk" fetch --depth 1 https://github.com/emscripten-core/emsdk.git 708dcbcc9ee23bc7d2dad44fc90db377e38b771c
    git -C "$TOOLS/emsdk" checkout --detach FETCH_HEAD
fi
version=$(cat "$ENGINE/emsdk-version")
"$TOOLS/emsdk/emsdk" install "$version"
"$TOOLS/emsdk/emsdk" activate "$version"
PATH=$TOOLS/${archive%.tar.gz}/bin:$TOOLS/emsdk/upstream/emscripten:$PATH
export PATH
PYTHONPATH=$TOOLS/py${PYTHONPATH:+:$PYTHONPATH}
export PYTHONPATH
if ! python3 -c 'import yaml' 2>/dev/null; then
    python3 -m pip install --target "$TOOLS/py" PyYAML==6.0.3
fi
JOBS=${JOBS:-4}
export JOBS
exec sh "$ENGINE/build.sh" menu
