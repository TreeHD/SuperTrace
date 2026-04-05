import {useState, useEffect, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@supertrace_history';
const MAX_HISTORY = 10;

export function useHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(val => {
      if (val) {
        try {
          setHistory(JSON.parse(val));
        } catch (e) {}
      }
    });
  }, []);

  const addHistory = useCallback(async (host: string) => {
    if (!host) return;
    setHistory(prev => {
      const next = [host, ...prev.filter(h => h !== host)].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  return {history, addHistory, clearHistory};
}
