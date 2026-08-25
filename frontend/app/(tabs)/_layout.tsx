import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { useUser } from "@/src/context/UserContext";

type IconProps = { color: string; size: number };
const HomeIcon = ({ color, size }: IconProps) => <Ionicons name="home" size={size} color={color} />;
const CalIcon = ({ color, size }: IconProps) => <Ionicons name="calendar" size={size} color={color} />;
const SwapIcon = ({ color, size }: IconProps) => <Ionicons name="swap-horizontal" size={size} color={color} />;
const LeavesIcon = ({ color, size }: IconProps) => <Ionicons name="airplane" size={size} color={color} />;
const PersonIcon = ({ color, size }: IconProps) => <Ionicons name="person" size={size} color={color} />;

export default function TabsLayout() {
  const { currentUser } = useUser();
  const isVolunteer = currentUser?.role === "Volontario";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryFg,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Oggi",
          tabBarIcon: HomeIcon,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: CalIcon,
        }}
      />
      <Tabs.Screen
        name="swaps"
        options={{
          title: "Scambi",
          tabBarIcon: SwapIcon,
          href: isVolunteer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="leaves"
        options={{
          title: "Assenze",
          tabBarIcon: LeavesIcon,
          href: isVolunteer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profilo",
          tabBarIcon: PersonIcon,
        }}
      />
    </Tabs>
  );
}
