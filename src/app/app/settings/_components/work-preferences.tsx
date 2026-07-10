import { cn } from '@/lib/utils';
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

export default function WorkPreferences({ preferences, onChange }: Props) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Work Preferences</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Define how you like to flow through your pillars.
                </p>
            </div>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <CardHeader>
                    <CardTitle className="text-base">Pillar Flow</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Spacing Strategy</Label>
                            <p className="text-xs text-[var(--text-tertiary)]">How distinct tasks should be grouped</p>
                        </div>
                        <Select
                            value={preferences.pillar_spacing_preference}
                            onValueChange={(v: string) => onChange({ pillar_spacing_preference: v as 'alternate' | 'cluster_ok' })}
                        >
                            <SelectTrigger className="w-[180px] bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cluster_ok">Cluster Deep Work</SelectItem>
                                <SelectItem value="alternate">Alternate Pillars</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-[var(--glass-border)]">
                        <h4 className="text-sm font-medium">Preferred Windows</h4>
                        {['mind', 'body', 'craft'].map((pillar) => (
                            <div key={pillar} className="flex items-center justify-between p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)]/50">
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-2 h-2 rounded-full",
                                        pillar === 'mind' ? 'bg-blue-400' :
                                            pillar === 'body' ? 'bg-green-400' : 'bg-purple-400'
                                    )} />
                                    <span className="capitalize text-sm font-medium">{pillar}</span>
                                </div>
                                <div className="text-right">
                                    <div className="font-medium text-[var(--color-primary)]">
                                        {Array.isArray(preferences.preferred_windows?.[pillar as keyof typeof preferences.preferred_windows])
                                            ? preferences.preferred_windows[pillar as keyof typeof preferences.preferred_windows]?.join(', ')
                                            : 'Not set'}
                                    </div>
                                    <div className="text-xs text-[var(--text-tertiary)]">Preferred Hours</div>
                                </div>
                            </div>
                        ))}
                        <p className="text-[10px] text-[var(--text-tertiary)] text-center">
                            Full window customization available in future updates
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
