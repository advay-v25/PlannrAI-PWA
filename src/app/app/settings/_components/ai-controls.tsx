
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

export default function AIControls({ preferences, onChange }: Props) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Intelligence</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Calibrate how proactive the AI is in managing your life.
                </p>
            </div>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Proactivity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Proactive Level</Label>
                            <span className="text-xs font-mono text-[var(--color-primary)] uppercase">{preferences.proactive_level}</span>
                        </div>
                        {/* Mock Slider using Select for simplicity if Slider component has complex props */}
                        <Select
                            value={preferences.proactive_level}
                            onValueChange={(v: string) => onChange({ proactive_level: v as 'off' | 'low' | 'standard' })}
                        >
                            <SelectTrigger className="bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="off">Off (Passive)</SelectItem>
                                <SelectItem value="low">Low (Suggestions only)</SelectItem>
                                <SelectItem value="standard">Standard (Full Assistant)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Ask Before Changing</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">Require confirmation for schedule edits</p>
                        </div>
                        <Switch
                            checked={preferences.ask_before_changes}
                            onCheckedChange={(c: boolean) => onChange({ ask_before_changes: c })}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Max Options</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">Choices presented by Coach</p>
                        </div>
                        <Select
                            value={String(preferences.max_ai_options)}
                            onValueChange={(v: string) => onChange({ max_ai_options: parseInt(v) as 1 | 2 | 3 })}
                        >
                            <SelectTrigger className="w-[100px] bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1 (Decisive)</SelectItem>
                                <SelectItem value="2">2 (Balanced)</SelectItem>
                                <SelectItem value="3">3 (Flexible)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Energy Overrides</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Low Energy Mode</Label>
                        <Switch
                            checked={preferences.low_energy_mode}
                            onCheckedChange={(c) => onChange({ low_energy_mode: c })}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Overwhelm Mode</Label>
                        <Switch
                            checked={preferences.overwhelm_mode}
                            onCheckedChange={(c) => onChange({ overwhelm_mode: c })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Weekly Review Survey</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">Interactive end-of-week reflection</p>
                        </div>
                        <Switch
                            checked={preferences.weekly_review_enabled !== false}
                            onCheckedChange={(c) => onChange({ weekly_review_enabled: c })}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
