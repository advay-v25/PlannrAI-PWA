
import { ProfilePreferences } from '@/lib/types/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

interface Props {
    preferences: ProfilePreferences;
    onChange: (patch: Partial<ProfilePreferences>) => void;
}

export default function Integrations({ preferences, onChange }: Props) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">Integrations</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                    Connect external tools (Coming Soon).
                </p>
            </div>

            <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)] opacity-60">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Google Calendar
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                        Two-way sync with your primary calendar.
                    </p>
                    <div className="flex items-center justify-between">
                        <Label>Sync Enabled</Label>
                        <Switch
                            disabled
                            checked={preferences.calendar_integration_enabled}
                        />
                    </div>
                    <Button variant="outline" size="sm" disabled className="w-full">
                        Connect Account (Coming Soon)
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
