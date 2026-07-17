
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CHRONOTYPE_ARCHETYPES } from '@/lib/chronotype';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

const showMeal = (preferences: ProfilePreferences, meal: 'breakfast' | 'lunch' | 'dinner') => {
    if (preferences.meals_per_day === 3) return true;
    // two_meals_selection values are literally "<meal>_<meal>", so a substring
    // check against each fixed meal name works — no need to split/parse.
    return (preferences.two_meals_selection ?? 'breakfast_dinner').includes(meal);
};

export default function CoreConstraints({ preferences, onChange }: Props) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Core Constraints</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    These hard limits define the boundaries of your day. Changing them impacts your entire schedule.
                </p>
            </div>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Sleep & Recovery</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Wake Time</Label>
                        <Input
                            type="time"
                            value={preferences.wake_time}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ wake_time: e.target.value })}
                            className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Sleep Start</Label>
                        <Input
                            type="time"
                            value={preferences.sleep_start}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ sleep_start: e.target.value })}
                            className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Archetype</Label>
                        <Select
                            value={preferences.chronotype || 'bear'}
                            onValueChange={(v: string) => onChange({ chronotype: v as 'lark' | 'bear' | 'owl' | 'wolf' })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {CHRONOTYPE_ARCHETYPES.map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>{opt.label} — {opt.hint}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Wind Down (Minutes)</Label>
                        <Select
                            value={String(preferences.wind_down_min)}
                            onValueChange={(v: string) => onChange({ wind_down_min: parseInt(v) })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="45">45 min</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Morning Routine Buffer (Minutes)</Label>
                        <Select
                            value={String(preferences.morning_routine_min ?? 0)}
                            onValueChange={(v: string) => onChange({ morning_routine_min: parseInt(v) })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">None</SelectItem>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="45">45 min</SelectItem>
                                <SelectItem value="60">60 min</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {showMeal(preferences, 'breakfast') && (
                        <div className="space-y-2 col-span-1 md:col-span-2">
                            <Label>Breakfast Window</Label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">Start</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.breakfast?.start || '07:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                breakfast: { start: e.target.value, end: preferences.meal_windows?.breakfast?.end || '10:00' }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">End</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.breakfast?.end || '10:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                breakfast: { start: preferences.meal_windows?.breakfast?.start || '07:00', end: e.target.value }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    {showMeal(preferences, 'lunch') && (
                        <div className="space-y-2 col-span-1 md:col-span-2">
                            <Label>Lunch Window</Label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">Start</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.lunch?.start || '12:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                lunch: { start: e.target.value, end: preferences.meal_windows?.lunch?.end || '15:00' }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">End</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.lunch?.end || '15:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                lunch: { start: preferences.meal_windows?.lunch?.start || '12:00', end: e.target.value }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    {showMeal(preferences, 'dinner') && (
                        <div className="space-y-2 col-span-1 md:col-span-2">
                            <Label>Dinner Window</Label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">Start</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.dinner?.start || '20:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                dinner: { start: e.target.value, end: preferences.meal_windows?.dinner?.end || '21:30' }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-[var(--text-tertiary)] block mb-1">End</label>
                                    <Input
                                        type="time"
                                        value={preferences.meal_windows?.dinner?.end || '21:30'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({
                                            meal_windows: {
                                                ...preferences.meal_windows,
                                                dinner: { start: preferences.meal_windows?.dinner?.start || '20:00', end: e.target.value }
                                            }
                                        })}
                                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Structure</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Meals per Day</Label>
                        <Select
                            value={String(preferences.meals_per_day)}
                            onValueChange={(v: string) => onChange({
                                meals_per_day: parseInt(v) as 2 | 3,
                                ...(parseInt(v) === 2 && !preferences.two_meals_selection
                                    ? { two_meals_selection: 'breakfast_dinner' as const }
                                    : {})
                            })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2">2 Meals</SelectItem>
                                <SelectItem value="3">3 Meals</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {preferences.meals_per_day === 2 && (
                        <div className="space-y-2">
                            <Label>Which Two Meals?</Label>
                            <div className="flex gap-2">
                                {([
                                    { id: 'breakfast_lunch', label: 'Breakfast + Lunch' },
                                    { id: 'lunch_dinner', label: 'Lunch + Dinner' },
                                    { id: 'breakfast_dinner', label: 'Breakfast + Dinner' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => onChange({ two_meals_selection: opt.id })}
                                        className={`flex-1 py-2 px-2 rounded-md text-xs font-semibold text-center transition-colors border ${
                                            (preferences.two_meals_selection ?? 'breakfast_dinner') === opt.id
                                                ? 'bg-[var(--color-primary)] text-white border-transparent'
                                                : 'bg-[var(--color-bg-primary)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Buffer Blocks</Label>
                        <Select
                            value={String(preferences.buffer_min)}
                            onValueChange={(v: string) => onChange({ buffer_min: parseInt(v) as 5 | 10 | 15 })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">5 min</SelectItem>
                                <SelectItem value="10">10 min</SelectItem>
                                <SelectItem value="15">15 min</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <Label>Weekend Work</Label>
                            <Switch
                                checked={preferences.allow_weekend_work}
                                onCheckedChange={(c: boolean) => onChange({ allow_weekend_work: c, weekend_intensity: c ? 'light' : 'off' })}
                            />
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">Allow scheduling tasks on Sat/Sun</p>
                    </div>

                    {preferences.allow_weekend_work && (
                        <div className="space-y-2">
                            <Label>Weekend Intensity</Label>
                            <Select
                                value={preferences.weekend_intensity}
                                onValueChange={(v: string) => onChange({ weekend_intensity: v as 'light' | 'normal' })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="light">Light Mode</SelectItem>
                                    <SelectItem value="normal">Full Speed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
