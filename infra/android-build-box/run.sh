#!/bin/bash
set -e

IMAGE_NAME="deck-verified-site-android-build-box"
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_ROOT=$(realpath "$SCRIPT_DIR/../..")
DOCKERFILE_PATH="$SCRIPT_DIR/Dockerfile"

# Default to docker
CMD="sudo docker"
PODMAN_ARGS=""

# If CONTAINER_RUN_COMMAND is set to podman, use podman and add podman args
if [ "$CONTAINER_RUN_COMMAND" == "podman" ]; then
  CMD="podman"
  PODMAN_ARGS="--userns keep-id --security-opt label:disable"
fi

# Build the image
$CMD build -t $IMAGE_NAME -f "$DOCKERFILE_PATH" "$SCRIPT_DIR"

# Create build directory
mkdir -p \
    "$PROJECT_ROOT/.cache/.npm" \
    "$PROJECT_ROOT/.cache/.gradle"

# Run the container
$CMD run --rm -it --name deckverified-build-box $PODMAN_ARGS \
    --user "$(id -u):$(id -g)" \
    -v "$PROJECT_ROOT":/project:z \
    -v "$PROJECT_ROOT/.cache/.npm":/.npm:z \
    -v "$PROJECT_ROOT/.cache/.gradle":/home/default/.gradle:z \
    $IMAGE_NAME "$@"
