/**
 * SuperTrace - Network Traceroute & Diagnostics App
 * Built with React Native 0.84 (New Architecture)
 */

import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import TracerouteScreen from './src/screens/TracerouteScreen';
import {Colors} from './src/theme';

const Stack = createNativeStackNavigator();

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
        translucent={false}
      />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: Colors.primary,
            background: Colors.background,
            card: Colors.surface,
            text: Colors.text,
            border: Colors.surfaceBorder,
            notification: Colors.accent,
          },
          fonts: {
            regular: {fontFamily: 'System', fontWeight: '400'},
            medium: {fontFamily: 'System', fontWeight: '500'},
            bold: {fontFamily: 'System', fontWeight: '700'},
            heavy: {fontFamily: 'System', fontWeight: '800'},
          },
        }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: {backgroundColor: Colors.background},
            animation: 'fade',
          }}>
          <Stack.Screen name="Traceroute" component={TracerouteScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
