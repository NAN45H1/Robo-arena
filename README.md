# Robo Arena

A 3D robot-duel browser game: build a robot from **mobility** (wheels / tracks / legs), **body** (scout / brawler / titan) and **weapon** (gatling / cannon / homing rockets / laser), then fight an AI robot in a small arena. First to win 2 rounds takes the match.

Static site (HTML + ES modules + Three.js from jsDelivr), built to be hosted on an UpCloud cloud server with nginx. No build step: any static file host works.

- Code: `site/` (entry `site/js/main.js`)

## Controls

WASD move · mouse aim · left click fire · right click zoom · Shift boost · Space jump (legs only) · R reload · M mute · Esc pause. Touch controls appear automatically on phones.

## Run locally

```bash
python dev_server.py 8080
```

Then open http://localhost:8080 (the dev server disables caching so edits show up on reload).

## Deploy to UpCloud

1. In the UpCloud Hub, deploy a small Ubuntu cloud server with your SSH public key and note its public IPv4.
2. Run:

```powershell
.\deploy\deploy.ps1 -Ip <server-ip> -Key ~\.ssh\<your-private-key>
```

This uploads `site/`, installs/configures nginx if needed (`deploy/setup-server.sh`), keeps a timestamped backup of the previous version in `/var/www/`, and reloads nginx. The game is then served at `http://<server-ip>/`.
