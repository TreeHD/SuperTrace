import {NativeModules, NativeEventEmitter, Platform} from 'react-native';
import type {HopResult, PingSummary} from '../types';

const {TracerouteModule} = NativeModules;

let emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(TracerouteModule);
  }
  return emitter;
}

export interface TracerouteCallbacks {
  onHopResult: (hop: HopResult) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export function startTraceroute(
  host: string,
  maxHops: number = 30,
  timeoutMs: number = 5000,
  callbacks: TracerouteCallbacks,
): () => void {
  const eventEmitter = getEmitter();

  const hopSubscription = eventEmitter.addListener(
    'onHopResult',
    (data: any) => {
      const hopResult: HopResult = {
        hop: data.hop,
        ip: data.ip || null,
        rtt1: data.rtt1 ?? null,
        rtt2: data.rtt2 ?? null,
        rtt3: data.rtt3 ?? null,
        done: data.done || false,
      };
      callbacks.onHopResult(hopResult);
    },
  );

  const completeSubscription = eventEmitter.addListener(
    'onTraceComplete',
    () => {
      callbacks.onComplete();
    },
  );

  const errorSubscription = eventEmitter.addListener(
    'onTraceError',
    (data: any) => {
      callbacks.onError(data?.error || 'Unknown error');
    },
  );

  // Start the traceroute
  TracerouteModule.startTraceroute(host, maxHops, timeoutMs);

  // Return cleanup function
  return () => {
    hopSubscription.remove();
    completeSubscription.remove();
    errorSubscription.remove();
    TracerouteModule.stopTraceroute();
  };
}

export async function resolveDns(host: string): Promise<string[]> {
  try {
    return await TracerouteModule.resolveDns(host);
  } catch (error) {
    console.warn('DNS Resolution failed:', error);
    return []; // Return empty array on failure instead of crashing
  }
}

export function stopTraceroute(): void {
  TracerouteModule.stopTraceroute();
}

export async function pingHost(
  host: string,
  count: number = 5,
  timeoutMs: number = 3000,
): Promise<PingSummary> {
  const result = await TracerouteModule.pingHost(host, count, timeoutMs);
  return {
    sent: result.sent,
    received: result.received,
    lost: result.lost,
    lossPercent: result.lossPercent,
    minRtt: result.minRtt,
    avgRtt: result.avgRtt,
    maxRtt: result.maxRtt,
    results: (result.results || []).map((r: any) => ({
      seq: r.seq,
      ip: r.ip,
      rtt: r.rtt ?? null,
      error: r.error,
    })),
  };
}
