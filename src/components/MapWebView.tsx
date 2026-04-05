import React, {useRef, useEffect, useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';
import {Colors} from '../theme';
import type {HopData} from '../types';

interface MapWebViewProps {
  hops: HopData[];
}

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0A0E1A; }
    #map { width: 100%; height: 100%; }
    .hop-marker {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      background: linear-gradient(135deg, #6C63FF, #5549E0);
      color: #fff; font-size: 12px; font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(108,99,255,0.5);
      border: 2px solid rgba(255,255,255,0.3);
    }
    .hop-marker.destination {
      background: linear-gradient(135deg, #00D9FF, #00B8D9);
      box-shadow: 0 2px 8px rgba(0,217,255,0.5);
      width: 34px; height: 34px; font-size: 14px;
    }
    .hop-popup { font-family: monospace; font-size: 12px; line-height: 1.5; }
    .hop-popup .hop-title { font-weight: 700; color: #333; margin-bottom: 4px; }
    .hop-popup .hop-ip { color: #6C63FF; font-family: monospace; }
    .hop-popup .hop-location { color: #666; }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-control-zoom a {
      background: #141929 !important; color: #E8EAED !important;
      border-color: #252B45 !important;
    }
    .leaflet-control-zoom a:hover { background: #1C2237 !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { center: [30, 0], zoom: 2, zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd'
    }).addTo(map);
    var markerGroup = L.layerGroup().addTo(map);
    var polyline = null;

    function updateHops(hops) {
      markerGroup.clearLayers();
      if (polyline) { map.removeLayer(polyline); polyline = null; }
      var coords = [];
      hops.forEach(function(hop) {
        if (hop.lat && hop.lng) {
          var latlng = [hop.lat, hop.lng];
          coords.push(latlng);
          var isLast = hop.isLast || false;
          var icon = L.divIcon({
            className: '',
            html: '<div class="hop-marker ' + (isLast ? 'destination' : '') + '">' + hop.hop + '</div>',
            iconSize: isLast ? [34, 34] : [28, 28],
            iconAnchor: isLast ? [17, 17] : [14, 14]
          });
          var marker = L.marker(latlng, { icon: icon });
          var popup = '<div class="hop-popup"><div class="hop-title">Hop #' + hop.hop + '</div>'
            + '<div class="hop-ip">' + (hop.ip || '???') + '</div>'
            + (hop.fqdn ? '<div class="hop-location">' + hop.fqdn + '</div>' : '')
            + (hop.location ? '<div class="hop-location">' + hop.location + '</div>' : '')
            + '</div>';
          marker.bindPopup(popup);
          markerGroup.addLayer(marker);
        }
      });
      if (coords.length > 1) {
        polyline = L.polyline(coords, { color: '#FF5252', weight: 3, opacity: 0.8, dashArray: '8, 6', smoothFactor: 1 }).addTo(map);
      }
      if (coords.length > 0) {
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 10 });
      }
    }

    window.addEventListener('message', function(e) {
      try { var d = JSON.parse(e.data); if (d.type === 'updateHops') updateHops(d.hops); } catch(err) {}
    });
    document.addEventListener('message', function(e) {
      try { var d = JSON.parse(e.data); if (d.type === 'updateHops') updateHops(d.hops); } catch(err) {}
    });
  </script>
</body>
</html>
`;

export default function MapWebView({hops}: MapWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = React.useState(false);

  const mapHops = useMemo(() => {
    return hops
      .filter(h => h.geoIp?.latitude && h.geoIp?.longitude)
      .map((h, _i, arr) => ({
        hop: h.hop,
        ip: h.ip,
        lat: h.geoIp!.latitude,
        lng: h.geoIp!.longitude,
        fqdn: h.fqdn || '',
        location: h.geoIp ? h.geoIp.country : '',
        isLast: h.done,
      }));
  }, [hops]);

  useEffect(() => {
    if (webViewRef.current && isReady) {
      const message = JSON.stringify({
        type: 'updateHops',
        hops: mapHops,
      });
      webViewRef.current.postMessage(message);
    }
  }, [mapHops, isReady]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{html: MAP_HTML}}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        mixedContentMode="always"
        onLoadEnd={() => setIsReady(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
