# SG Wind

Realtime wind conditions for Singapore cyclists — know your headwind before you ride.

**Live:** [https://joewis.github.io/SGWind/](https://joewis.github.io/SGWind/)

## Features

- **Live wind data** — speed and direction from NEA weather stations across Singapore
- **Headwind calculator** — set your riding direction and see exactly how much headwind or tailwind you're facing
- **Compass dial** — drag to set your heading visually
- **5 nearest stations** — automatically finds the closest weather stations to your location
- **Mobile-first PWA** — installable, works offline for cached data, designed for phone screens
- **Knots / km/h / m/s** — toggle between wind speed units

## How it works

The app fetches live data from the [NEA Data.gov.sg API](https://data.gov.sg) (wind speed and direction readings updated every 5 minutes) and maps them to Singapore's network of weather stations. Select the station nearest your usual route for the most relevant conditions.

Your location is requested only to sort stations by distance — it is never stored or transmitted anywhere.

## Tech

Pure client-side — HTML, CSS, vanilla JavaScript. No build step, no framework, no server required. Data is fetched directly from Singapore's open data API.

## Development

```bash
# Serve locally
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

For HTTPS (required for geolocation on some browsers):

```bash
python3 -c "
import http.server, ssl, os
os.chdir('/path/to/repo')
httpd = http.server.HTTPServer(('', 8443), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
httpd.serve_forever()
"
```

## Data sources

- Wind readings: [NEA Data.gov.sg](https://data.gov.sg) (wind speed and direction)
- Station coordinates: NEA weather station network

---
Installed as a PWA, the app works offline after first load.
