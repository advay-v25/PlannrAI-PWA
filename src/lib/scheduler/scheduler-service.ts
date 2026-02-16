
import { addDays, format, parseISO, startOfDay, addMinutes, isAfter, isBefore } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export interface SchedulerContext {
    startDate: Date;
    days: number;
    profile: any;
    commitments: any[];
    goals: any[];
    habitStacks: any[];
    existingBlocks: any[];
}

export class SchedulerService {
    private context: SchedulerContext;
    private generatedBlocks: any[] = [];

    constructor(context: SchedulerContext) {
        this.context = context;
    }

    public generateBaseline(): any[] {
        this.generatedBlocks = [];

        // 1. Process Each Day
        for (let i = 0; i < this.context.days; i++) {
            const currentDate = addDays(this.context.startDate, i);
            const dateStr = format(currentDate, 'yyyy-MM-dd');

            // 2. Add Fixed Constraints
            this.addSleepBlocks(dateStr);
            this.addMealBlocks(dateStr);
            this.addCommitments(dateStr, currentDate.getDay());

            // 3. Add Habit Stacks
            this.addHabitStacks(dateStr);

            // 4. Distribute Goals (Simple heuristic: Fill gaps)
            this.distributeGoals(dateStr);
        }

        return this.generatedBlocks;
    }

    private addBlock(block: any) {
        // Basic overlap check could happen here, or we allow overlap and resolve later.
        // For baseline, let's just push.
        this.generatedBlocks.push(block);
    }

    private addSleepBlocks(date: string) {
        const { sleep_start, sleep_end, wind_down_mins } = this.context.profile || {};
        // Default if missing
        const start = sleep_start || '23:00';
        const end = sleep_end || '07:00';
        const windDown = wind_down_mins || 30;

        // Morning Sleep (from previous day effectively, but on this day 00:00 to end)
        this.addBlock({
            id: uuidv4(),
            date,
            start_time: '00:00',
            end_time: end,
            title: 'Sleep',
            block_type: 'anchor',
            is_fixed: true,
            pillar: 'body'
        });

        // Evening Wind Down
        // Calculate wind down start
        // Simple string manipulation for MVP 'HH:MM'
        // Ideally use date-fns/parse

        this.addBlock({
            id: uuidv4(),
            date,
            start_time: start,
            end_time: '23:59',
            title: 'Sleep',
            block_type: 'anchor',
            is_fixed: true,
            pillar: 'body'
        });
    }

    private addMealBlocks(date: string) {
        const { meal_preferences } = this.context.profile || {};
        // Should parse preferences, for now default
        const meals = [
            { title: 'Breakfast', start: '08:00', end: '08:30' },
            { title: 'Lunch', start: '13:00', end: '13:30' },
            { title: 'Dinner', start: '19:00', end: '19:30' }
        ];

        meals.forEach(m => {
            this.addBlock({
                id: uuidv4(),
                date,
                start_time: m.start,
                end_time: m.end,
                title: m.title,
                block_type: 'meal',
                is_fixed: true, // Meals are sacred
                pillar: 'body'
            });
        });
    }

    private addCommitments(date: string, dayOfWeek: number) {
        // Adjust JS getDay() (0=Sun) to DB if needed. 
        // Assuming DB uses 0-6 matching JS.

        this.context.commitments.forEach(c => {
            if (c.days_of_week && c.days_of_week.includes(dayOfWeek)) {
                this.addBlock({
                    id: uuidv4(),
                    date,
                    start_time: c.start_time,
                    end_time: c.end_time,
                    title: c.title,
                    block_type: 'anchor',
                    is_fixed: true,
                    commitment_id: c.id,
                    pillar: 'mind' // Default, should come from commitment
                });
            }
        });
    }

    private addHabitStacks(date: string) {
        this.context.habitStacks.forEach(h => {
            // Check enabled, frequency?
            // Place in preferred window
            // Simplified placement: Morning -> 07:30, Afternoon -> 14:00, Evening -> 20:00
            let start = '07:30';
            let end = '08:00';

            if (h.preferred_window === 'afternoon') { start = '14:00'; end = '14:30'; }
            if (h.preferred_window === 'evening') { start = '20:00'; end = '20:30'; }

            this.addBlock({
                id: uuidv4(),
                date,
                start_time: start,
                end_time: end,
                title: h.name,
                block_type: 'habit_stack',
                habit_stack_id: h.id,
                is_fixed: false // Preferred, but moveable
            });
        });
    }

    private distributeGoals(date: string) {
        // Find gaps and fill with goals
        // This is complex. For Baseline, maybe just list them as suggestions 
        // or place one active goal block.

        const activeGoals = this.context.goals.filter(g => !g.is_paused);
        if (activeGoals.length === 0) return;

        // Naive placement: 09:00 - 11:00 for highest priority
        const topGoal = activeGoals[0];

        this.addBlock({
            id: uuidv4(),
            date,
            start_time: '09:00',
            end_time: '10:30',
            title: `Focus: ${topGoal.title}`,
            block_type: 'goal',
            goal_id: topGoal.id,
            pillar: topGoal.pillar || 'mind',
            is_fixed: false
        });
    }
}
