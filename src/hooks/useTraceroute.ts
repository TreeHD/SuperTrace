import {useState, useCallback, useRef} from 'react';
import type {HopData, TracerouteStatus} from '../types';
import {startTraceroute, stopTraceroute} from '../services/tracerouteService';
import {lookupGeoIp} from '../services/geoIpService';
import {reverseLookup} from '../services/dnsService';

export function useTraceroute() {
  const [hops, setHops] = useState<HopData[]>([]);
  const [status, setStatus] = useState<TracerouteStatus>('idle');
  const [target, setTarget] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const enrichHop = useCallback(async (hop: HopData) => {
    if (!hop.ip) return;

    // Fetch GeoIP data
    try {
      const geoIp = await lookupGeoIp(hop.ip);
      setHops(prev =>
        prev.map(h =>
          h.hop === hop.hop ? {...h, geoIp, geoLoading: false} : h,
        ),
      );
    } catch (e) {
      setHops(prev =>
        prev.map(h =>
          h.hop === hop.hop ? {...h, geoLoading: false} : h,
        ),
      );
    }

    // Fetch FQDN
    try {
      const fqdn = await reverseLookup(hop.ip);
      setHops(prev =>
        prev.map(h =>
          h.hop === hop.hop ? {...h, fqdn, fqdnLoading: false} : h,
        ),
      );
    } catch (e) {
      setHops(prev =>
        prev.map(h =>
          h.hop === hop.hop ? {...h, fqdnLoading: false} : h,
        ),
      );
    }
  }, []);

  const trace = useCallback(
    (host: string) => {
      // Clean up previous run
      if (cleanupRef.current) {
        cleanupRef.current();
      }

      // Start empty — rows are inserted as discover() returns each hop's IP.
      // Concurrent probes can land out of order, but onHopResult below sorts
      // by hop number on every insert, so the visible list is always
      // monotonic. Placeholders made the list flash with 30 empty rows
      // before any data was real, which felt slower than it was.
      setHops([]);
      setStatus('running');
      setTarget(host);
      setError(null);

      const cleanup = startTraceroute(host, 30, 5000, {
        onHopResult: hop => {
          const hopData: HopData = {
            ...hop,
            geoIp: undefined,
            fqdn: undefined,
            geoLoading: !!hop.ip,
            fqdnLoading: !!hop.ip,
          };

          setHops(prev => {
            let updated = [...prev];
            const existing = prev.findIndex(h => h.hop === hop.hop);
            if (existing >= 0) {
              updated[existing] = hopData;
            } else {
              updated.push(hopData);
            }
            
            // Always sort because concurrent responses arrive out of order
            updated.sort((a, b) => a.hop - b.hop);
            
            // Filter out duplicate trailing hops beyond destination (caused by parallel requests reaching dest)
            const destIndex = updated.findIndex(h => h.done);
            if (destIndex >= 0) {
              updated = updated.slice(0, destIndex + 1);
            }
            
            return updated;
          });

          // Start async enrichment for this hop
          if (hop.ip) {
            enrichHop(hopData);
          }
        },
        onComplete: () => {
          setStatus('done');
        },
        onError: errMsg => {
          setStatus('error');
          setError(errMsg);
        },
      });

      cleanupRef.current = cleanup;
    },
    [enrichHop],
  );

  const stop = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    stopTraceroute();
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setHops([]);
    setTarget('');
    setError(null);
  }, [stop]);

  return {
    hops,
    status,
    target,
    error,
    trace,
    stop,
    reset,
  };
}
