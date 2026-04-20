export const CYCLE_PHASES = {
  menstrual: {
    name: 'Menstrual Phase',
    days: '1-5',
    color: '#FF6B6B',
    emoji: '🔴',
    description: 'Period days. Energy is low. Prioritize rest and recovery.',
    workoutRecommendations: [
      'Go lighter on weights — reduce by 20-30%',
      'Focus on low-intensity cardio (walking, yoga)',
      'Avoid heavy compound lifts if cramping',
      'Prioritize stretching and mobility work',
      'Rest is productive — listen to your body',
    ],
    nutritionTips: [
      'Increase iron intake — red meat, spinach, lentils',
      'Eat anti-inflammatory foods — berries, fatty fish, ginger',
      'Stay hydrated — bloating is common',
      'Magnesium helps with cramps — dark chocolate, nuts',
      'Reduce sodium to minimize water retention',
      'Slight calorie increase is normal and okay',
    ],
    weightNote: 'Expect 1-3kg water weight increase. This is normal. Do not adjust program.',
  },
  follicular: {
    name: 'Follicular Phase',
    days: '6-13',
    color: '#4ECDC4',
    emoji: '🌱',
    description: 'Energy rising. Best time to push hard and build strength.',
    workoutRecommendations: [
      'Peak strength and performance window',
      'Go heavier — attempt PRs this week',
      'High intensity training is optimal',
      'Add volume to your lifts',
      'Great time for new exercises and skills',
    ],
    nutritionTips: [
      'Increase carbs to fuel higher intensity training',
      'Protein remains high for muscle building',
      'Estrogen naturally suppresses appetite — eat enough',
      'Iron-rich foods help replenish after period',
      'Good time to be in slight calorie surplus for gains',
    ],
    weightNote: 'Weight typically drops after period. True body weight window.',
  },
  ovulation: {
    name: 'Ovulation Phase',
    days: '14-16',
    color: '#FFE66D',
    emoji: '⭐',
    description: 'Peak energy and strength. Best athletic performance window.',
    workoutRecommendations: [
      'Absolute peak performance — push your hardest',
      'Attempt personal records now',
      'High power and explosive movements ideal',
      'Great for HIIT and max effort sessions',
      'Be mindful of injury risk — joints are looser',
    ],
    nutritionTips: [
      'Maintain higher carb intake',
      'Zinc and antioxidants support ovulation',
      'Eat plenty of fiber — cruciferous vegetables',
      'Stay hydrated — temperatures may rise slightly',
      'Lean proteins help maintain muscle mass',
    ],
    weightNote: 'Weight is most stable and accurate here. Good time for check-ins.',
  },
  luteal: {
    name: 'Luteal Phase',
    days: '17-28',
    color: '#A78BFA',
    emoji: '🌙',
    description: 'Energy declining toward end. Manage cravings and mood.',
    workoutRecommendations: [
      'Moderate intensity — maintain but do not push for PRs',
      'Reduce weight slightly in second half of phase',
      'Focus on form and mind-muscle connection',
      'More rest between sets is okay',
      'Yoga and mobility work become more important',
    ],
    nutritionTips: [
      'Cravings increase — plan your nutrition ahead',
      'Increase complex carbs to manage mood swings',
      'Magnesium and B6 reduce PMS symptoms',
      'Reduce caffeine — sensitivity increases',
      'Slight calorie increase (200-300 kcal) is normal',
      'Avoid processed sugar spikes',
    ],
    weightNote: 'Expect 1-2kg water retention in last week. Do not panic — it drops after period.',
  },
};

export function getCurrentPhase(cycleStartDate, cycleLength = 28) {
  if (!cycleStartDate) return null;
  const start = new Date(cycleStartDate);
  const today = new Date();
  const dayOfCycle = Math.floor((today - start) / (1000 * 60 * 60 * 24)) % cycleLength + 1;
  if (dayOfCycle <= 5) return { phase: CYCLE_PHASES.menstrual, day: dayOfCycle };
  if (dayOfCycle <= 13) return { phase: CYCLE_PHASES.follicular, day: dayOfCycle };
  if (dayOfCycle <= 16) return { phase: CYCLE_PHASES.ovulation, day: dayOfCycle };
  return { phase: CYCLE_PHASES.luteal, day: dayOfCycle };
}

export function getPhaseForDate(date, cycleStartDate, cycleLength = 28) {
  if (!cycleStartDate) return null;
  const start = new Date(cycleStartDate);
  const target = new Date(date);
  const diff = Math.floor((target - start) / (1000 * 60 * 60 * 24));
  if (diff < 0) return null;
  const dayOfCycle = diff % cycleLength + 1;
  if (dayOfCycle <= 5) return CYCLE_PHASES.menstrual;
  if (dayOfCycle <= 13) return CYCLE_PHASES.follicular;
  if (dayOfCycle <= 16) return CYCLE_PHASES.ovulation;
  return CYCLE_PHASES.luteal;
}