# --- Base: Node (for Quasar/Vite build)
FROM docker.io/mingc/android-build-box:latest

# REF:
# - https://hub.docker.com/r/mingc/android-build-box
# - https://quasar.dev/quasar-cli-vite/developing-capacitor-apps/capacitor-version-support

#RUN apt-get update && \
#    apt-get install -y \
#        java-21-openjdk java-21-openjdk-devel
#
# 1. Create a user with ID 1000:1000 named "default"
# 2. Copy the root home files to this new user's home directory
RUN useradd -m -u 1000 -s /bin/bash default && \
    cp -r /root/. /home/default/ && \
    chown -R 1000:1000 /home/default

# Set ownership of the Android SDK directory to the default user
#RUN chown -R 1000:1000 /opt/android-sdk

# Install Quasar CLI and Vite
RUN npm install -g @quasar/cli

# Set version of java
ARG JAVA_VERSION=17
RUN jenv global ${JAVA_VERSION:?}
ENV JAVA_HOME=/usr/lib/jvm/java-${JAVA_VERSION:?}-openjdk-amd64 \
    PATH=/usr/lib/jvm/java-${JAVA_VERSION:?}-openjdk-amd64/bin:$PATH

# Set the default user to this new user with id 1000
USER 1000

# Set empty entrypoint
ENTRYPOINT [""]
