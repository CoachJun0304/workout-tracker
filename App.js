import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { COLORS, FONTS, SIZES } from './src/theme';

// Auth
import LoginScreen from './src/screens/auth/LoginScreen';

// Coach
import DashboardScreen from './src/screens/coach/DashboardScreen';
import ClientsScreen from './src/screens/coach/ClientsScreen';
import ClientDetailScreen from './src/screens/coach/ClientDetailScreen';
import AddClientScreen from './src/screens/coach/AddClientScreen';
import TemplatesScreen from './src/screens/coach/TemplatesScreen';
import AssignProgramScreen from './src/screens/coach/AssignProgramScreen';
import LogWorkoutScreen from './src/screens/coach/LogWorkoutScreen';
import CoachHealthScreen from './src/screens/coach/CoachHealthScreen';

// Shared
import ProgressScreen from './src/screens/shared/ProgressScreen';
import RecordsScreen from './src/screens/shared/RecordsScreen';
import HealthScreen from './src/screens/shared/HealthScreen';
import WorkoutRescheduleScreen from './src/screens/shared/WorkoutRescheduleScreen';

// Client
import ClientHomeScreen from './src/screens/client/ClientHomeScreen';
import ClientWorkoutScreen from './src/screens/client/ClientWorkoutScreen';
import ClientLogScreen from './src/screens/client/ClientLogScreen';
import ClientProgressScreen from './src/screens/client/ClientProgressScreen';
import ClientRecordsScreen from './src/screens/client/ClientRecordsScreen';
import ClientProfileScreen from './src/screens/client/ClientProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.roseGold,
    secondary: COLORS.roseGoldLight,
    background: COLORS.darkBg,
    surface: COLORS.darkCard,
    surfaceVariant: COLORS.darkCard2,
  },
};

const stackOptions = {
  headerStyle: { backgroundColor: COLORS.darkCard },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '700' },
};

// ── COACH STACK ──────────────────────────────────────────
function CoachClientsStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="ClientsList" component={ClientsScreen}
        options={{ title: 'Clients' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen}
        options={{ title: 'Client Profile' }} />
      <Stack.Screen name="AddClient" component={AddClientScreen}
        options={{ title: 'Add Client' }} />
      <Stack.Screen name="AssignProgram" component={AssignProgramScreen}
        options={{ title: 'Assign Program' }} />
      <Stack.Screen name="LogWorkout" component={LogWorkoutScreen}
        options={{ title: 'Log Workout' }} />
      <Stack.Screen name="Progress" component={ProgressScreen}
        options={{ title: 'Progress' }} />
      <Stack.Screen name="Records" component={RecordsScreen}
        options={{ title: 'Personal Records' }} />
      <Stack.Screen name="CoachHealth" component={CoachHealthScreen}
        options={{ title: 'Health & Nutrition' }} />
    </Stack.Navigator>
  );
}

function CoachTabs() {
  return (
    <Tab.Navigator screenOptions={{
      tabBarStyle: {
        backgroundColor: COLORS.darkCard,
        borderTopColor: COLORS.darkBorder,
        height: 60, paddingBottom: 8,
      },
      tabBarActiveTintColor: COLORS.roseGold,
      tabBarInactiveTintColor: COLORS.textMuted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      headerStyle: { backgroundColor: COLORS.darkCard },
      headerTintColor: COLORS.white,
      headerTitleStyle: { fontWeight: '700' },
    }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen}
        options={{
          title: 'FitCoach Pro',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>📊</Text>,
        }} />
      <Tab.Screen name="Clients" component={CoachClientsStack}
        options={{
          tabBarLabel: 'Clients',
          headerShown: false,
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>👥</Text>,
        }} />
      <Tab.Screen name="Templates" component={TemplatesScreen}
        options={{
          title: 'Programs',
          tabBarLabel: 'Programs',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>📋</Text>,
        }} />
    </Tab.Navigator>
  );
}

// ── CLIENT STACK ──────────────────────────────────────────
function ClientStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
      <Stack.Screen name="ClientWorkout" component={ClientWorkoutScreen}
        options={{ ...stackOptions, headerShown: true, title: "Today's Workout" }} />
      <Stack.Screen name="ClientLog" component={ClientLogScreen}
        options={{ ...stackOptions, headerShown: true, title: 'Log Workout' }} />
      <Stack.Screen name="Reschedule" component={WorkoutRescheduleScreen}
        options={{ ...stackOptions, headerShown: true, title: 'Workout Schedule' }} />
    </Stack.Navigator>
  );
}

function ClientTabs() {
  return (
    <Tab.Navigator screenOptions={{
      tabBarStyle: {
        backgroundColor: COLORS.darkCard,
        borderTopColor: COLORS.darkBorder,
        height: 60, paddingBottom: 8,
      },
      tabBarActiveTintColor: COLORS.roseGold,
      tabBarInactiveTintColor: COLORS.textMuted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      headerShown: false,
    }}>
      <Tab.Screen name="Home" component={ClientStack}
        options={{
          tabBarLabel: 'Workouts',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>🏋️</Text>,
        }} />
      <Tab.Screen name="MyProgress" component={ProgressScreen}
        options={{
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>📈</Text>,
        }} />
      <Tab.Screen name="MyHealth" component={HealthScreen}
        options={{
          tabBarLabel: 'Health',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>🥗</Text>,
        }} />
      <Tab.Screen name="MyRecords" component={RecordsScreen}
        options={{
          tabBarLabel: 'Records',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>🏆</Text>,
        }} />
      <Tab.Screen name="MyProfile" component={ClientProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) =>
            <Text style={{ fontSize: 20, color }}>👤</Text>,
        }} />
    </Tab.Navigator>
  );
}

// ── ROOT NAVIGATOR ──────────────────────────────────────────
function AppNavigator() {
  const { user, profile, loading, isCoach } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.roseGold} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : isCoach ? (
        <CoachTabs />
      ) : (
        <ClientTabs />
      )}
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', backgroundColor: COLORS.darkBg,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12, fontSize: SIZES.md,
  },
});