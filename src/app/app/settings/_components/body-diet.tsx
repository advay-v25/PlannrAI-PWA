
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

export default function BodyDiet({ preferences, onChange }: Props) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Body & Nutrition</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Fueling your engine.
                </p>
            </div>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardContent className="pt-6 space-y-6">
                    <div className="space-y-2">
                        <Label>Diet Type</Label>
                        <Select
                            value={preferences.diet_type}
                            onValueChange={(v: string) => onChange({ diet_type: v as 'veg' | 'vegan' | 'eggetarian' | 'other' })}
                        >
                            <SelectTrigger className="bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="veg">Vegetarian</SelectItem>
                                <SelectItem value="vegan">Vegan</SelectItem>
                                <SelectItem value="eggetarian">Eggetarian</SelectItem>
                                <SelectItem value="other">Other/Omnivore</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Workout Style</Label>
                        <Select
                            value={preferences.workout_preference}
                            onValueChange={(v: string) => onChange({ workout_preference: v as 'gym' | 'sports' | 'walk' | 'mixed' })}
                        >
                            <SelectTrigger className="bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gym">Gym / Resistance</SelectItem>
                                <SelectItem value="sports">Sports</SelectItem>
                                <SelectItem value="walk">Walking / Light</SelectItem>
                                <SelectItem value="mixed">Mixed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Daily Minimum (Min)</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">Non-negotiable movement</p>
                        </div>
                        <Input
                            type="number"
                            className="w-[80px] bg-transparent"
                            value={preferences.workout_min_per_day}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ workout_min_per_day: parseInt(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Protected Block</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">Scheduler never overrides workout</p>
                        </div>
                        <Switch
                            checked={preferences.is_workout_protected}
                            onCheckedChange={(c: boolean) => onChange({ is_workout_protected: c })}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
