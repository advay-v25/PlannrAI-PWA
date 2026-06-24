
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

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
                    <div className="space-y-2">
                        <Label>Breakfast Start Time</Label>
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
                    <div className="space-y-2">
                        <Label>Lunch Start Time</Label>
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
                    <div className="space-y-2">
                        <Label>Dinner Start Time</Label>
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
                            onValueChange={(v: string) => onChange({ meals_per_day: parseInt(v) as 2 | 3 })}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2">2 Meals</SelectItem>
                                <SelectItem value="3">3 Meals</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

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
