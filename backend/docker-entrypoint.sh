#!/bin/sh
# Ensure /data/docs is writable by app user; volume may be root-owned on first mount.
mkdir -p /data/docs
chown -R app:app /data
exec gosu app "$@"
