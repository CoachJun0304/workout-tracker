import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

import LoginScreen from './src/screens/auth/LoginScreen';
import DashboardScreen from './src/screens/coach/DashboardScreen';
import ClientsScreen from './src/screens/coach/ClientsScreen';
import ClientDetailScreen from './src/screens/coach/ClientDetailScreen';
import AddClientScreen from './src/screens/coach/AddClientScreen';
import TemplatesScreen from './src/screens/coach/TemplatesScreen';
import AssignProgramScreen from './src/screens/coach/AssignProgramScreen';
import LogWorkoutScreen from './src/screens/coach/LogWorkoutScreen';
import ProgressScreen from './src/screens/shared/ProgressScreen';
import RecordsScreen from './src/screens/shared/RecordsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6C63FF',
    secondary: '#00B894',
    background: '#0a0a0a',
    surface: '#1a1a1a',
    surfaceVariant: '#2a2a2a',
  },
};

function ClientsStack() {
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: '#1a1a1a' },
      headerTintColor: '#fff'
    }}>
      <Stack.Screen name="ClientsList" component={ClientsScreen} options={{ title: 'Clients' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: 'Client Profile' }} />
      <Stack.Screen name="AddClient" component={AddClientScreen} options={{ title: 'Add Client' }} />
      <Stack.Screen name="AssignProgram" component={AssignProgramScreen} options={{ title: 'Assign Program' }} />
      <Stack.Screen name="LogWorkout" component={LogWorkoutScreen} options={{ title: 'Log Workout' }} />
      <Stack.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress' }} />
      <Stack.Screen name="Records" component={RecordsScreen} options={{ title: 'Personal Records' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{
      tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
      tabBarActiveTintColor: '#6C63FF',
      tabBarInactiveTintColor: '#888',
      headerStyle: { backgroundColor: '#1a1a1a' },
      headerTintColor: '#fff',
    }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen}
        options={{ tabBarLabel: 'Dashboard', title: '💪 Workout Tracker' }} />
      <Tab.Screen name="Clients" component={ClientsStack}
        options={{ tabBarLabel: 'Clients', headerShown: false }} />
      <Tab.Screen name="Templates" component={TemplatesScreen}
        options={{ tabBarLabel: 'Templates', title: 'Workout Templates' }} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user
        ? <MainTabs />
        : <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
      }
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </PaperProvider>
  );
}