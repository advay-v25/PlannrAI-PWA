import { executeAI } from '../lib/ai/ai-service';

async function main() {
    console.log('Testing Coach AI...');
    try {
        const res = await executeAI('dummy-user-id', {
            channel: 'coach',
            input: "I feel overwhelmed, empty my afternoon",
            context: {
                schedule: [
                    { id: '1', title: 'Meeting', start_time: '14:00', end_time: '15:00', date: new Date().toISOString().split('T')[0] },
                    { id: '2', title: 'Deep Work', start_time: '15:00', end_time: '17:00', date: new Date().toISOString().split('T')[0] }
                ],
                userState: {
                    is_overwhelmed: true,
                    energy_level: 2
                }
            }
        });
        console.log(JSON.stringify(res, null, 2));
    } catch (err: any) {
        console.error('Test failed:', err);
    }
}

main();
