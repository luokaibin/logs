/**
 * Logbeacon React Native 示例：与 `examples/next-log-test/app/page.tsx` 能力对齐，
 * 便于联调本地占位 beacon（如 Next 示例的 `POST /api/beacon` → 204）。
 *
 * @format
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import log, {requestFlush, setBeaconUrl} from '@logbeacon/react-native';

function defaultBeaconUrl(): string {
  const host = Platform.OS === 'android' ? 'http://localhost:3101' : 'http://localhost:3100';
  return `${host}/api/beacon`;
}

export default function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [beaconInput, setBeaconInput] = useState(defaultBeaconUrl);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // 默认级别为 WARN，不放开则 info / debug 不会进入上报链路。
    // ConsoleLogger 运行时使用大写键（与类型里的 'trace' 等小写声明不一致）。
    (log as {setLevel: (level: string) => void}).setLevel('TRACE');
    const initial = defaultBeaconUrl();
    void setBeaconUrl(initial).then(() => {
      setStatus(`已设置 beacon: ${initial}`);
    });
  }, []);

  const applyBeacon = useCallback(async () => {
    const u = beaconInput.trim();
    if (!u) {
      setStatus('beacon URL 不能为空');
      return;
    }
    try {
      await setBeaconUrl(u);
      setStatus(`已设置 beacon: ${u}`);
    } catch (e) {
      setStatus(`设置失败: ${String(e)}`);
    }
  }, [beaconInput]);

  const onSendInfo = useCallback(() => {
    log.info('RN 示例：手动测试日志', {source: 'examples/rn-log-test'});
  }, []);

  const onSendError = useCallback(() => {
    log.error(new Error('RN 示例：测试 error 级别'));
  }, []);

  const onDedupPair = useCallback(() => {
    const content = `dedup-test-${Date.now()}`;
    log.info(content);
    log.info(content);
  }, []);

  const onBurst = useCallback(() => {
    const t = Date.now();
    for (let i = 0; i < 6; i += 1) {
      log.info(`burst ${t} #${i}`);
    }
  }, []);

  const onFlush = useCallback(async () => {
    try {
      await requestFlush();
      setStatus('已调用 requestFlush()（对齐 Web logbeacon:flush）');
    } catch (e) {
      setStatus(`flush 失败: ${String(e)}`);
    }
  }, []);

  const hintStyle = useMemo(
    () => [styles.hint, {color: isDark ? '#aaa' : '#444'}],
    [isDark],
  );

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, isDark && styles.textLight]}>Logbeacon × React Native</Text>
        <Text style={[styles.p, isDark && styles.textLight]}>
          依赖 <Text style={styles.code}>@logbeacon/react-native</Text>
          ，能力与 Web 一致：SQLite 缓冲、聚合、按条件 flush；生命周期映射为{' '}
          <Text style={styles.code}>page-load</Text> /{' '}
          <Text style={styles.code}>page-visible</Text> /{' '}
          <Text style={styles.code}>page-hidden</Text>（退后台会触发上报）。
        </Text>
        <Text style={hintStyle}>
          调试输出：请在 Metro / 原生调试器 Console 中查看带{' '}
          <Text style={styles.code}>[log store]</Text>、<Text style={styles.code}>[log processor]</Text>、
          <Text style={styles.code}>[log aggregator]</Text>、<Text style={styles.code}>[logbeacon]</Text>{' '}
          等前缀的日志；同时观察对 beacon URL 的网络请求。
        </Text>

        <Text style={[styles.label, isDark && styles.textLight]}>Beacon URL</Text>
        <TextInput
          value={beaconInput}
          onChangeText={setBeaconInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={defaultBeaconUrl()}
          placeholderTextColor="#888"
          style={[styles.input, isDark && styles.inputDark]}
        />
        <TouchableOpacity style={styles.btn} onPress={() => void applyBeacon()}>
          <Text style={styles.btnText}>应用 beacon URL</Text>
        </TouchableOpacity>

        {status ? (
          <Text style={[styles.status, isDark && styles.textLight]}>{status}</Text>
        ) : null}

        <View style={styles.row}>
          <Btn title="发送 info 测试日志" onPress={onSendInfo} />
          <Btn title="发送 error 测试日志" onPress={onSendError} />
          <Btn title="去重测试（同内容 2 条）" onPress={onDedupPair} />
          <Btn title="连发 6 条不同内容" onPress={onBurst} />
          <Btn title="requestFlush()" onPress={() => void onFlush()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Btn({title, onPress}: {title: string; onPress: () => void}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.actionBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#f6f6f6'},
  safeDark: {backgroundColor: '#121212'},
  scroll: {padding: 16, paddingBottom: 32},
  title: {fontSize: 22, fontWeight: '700', marginBottom: 12},
  p: {fontSize: 15, lineHeight: 22, marginBottom: 10},
  hint: {fontSize: 13, lineHeight: 20, marginBottom: 16},
  textLight: {color: '#eee'},
  code: {fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13},
  label: {fontSize: 14, fontWeight: '600', marginBottom: 6},
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  inputDark: {
    borderColor: '#444',
    backgroundColor: '#1e1e1e',
    color: '#eee',
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  btnText: {color: '#fff', fontWeight: '600'},
  status: {fontSize: 13, marginBottom: 16},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  actionBtn: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  actionBtnText: {fontSize: 14, color: '#111'},
});
