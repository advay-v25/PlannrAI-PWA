import { PlannerAgent } from './planner/planner-agent';
import { RegulatorAgent } from './regulator/regulator-agent';
import { SchedulerAgent } from './scheduler/scheduler-agent';
import { ValidatorAgent } from './validator/validator-agent';
import { AgentContext, PlannerOutput, RegulatorOutput, SchedulerOutput, ValidatorOutput } from './core/types';

export class AgentOrchestrator {
    private planner: PlannerAgent;
    private regulator: RegulatorAgent;
    private scheduler: SchedulerAgent;
    private validator: ValidatorAgent;

    constructor() {
        this.planner = new PlannerAgent();
        this.regulator = new RegulatorAgent();
        this.scheduler = new SchedulerAgent();
        this.validator = new ValidatorAgent();
    }

    /**
     * Run the Multi-Agent Pipeline (Phase 11: Full Chain)
     */
    async run(
        userId: string,
        userMessage: string,
        mockSchedule?: any[]
    ): Promise<{
        planner: PlannerOutput,
        regulator: RegulatorOutput,
        scheduler: SchedulerOutput,
        validation: ValidatorOutput[], // One validation per option
        summary: string // The generated 2-line summary
    }> {
        console.log("🧩 Orchestrator: Starting Pipeline for", userId);

        const context: AgentContext = {
            userId,
            now: new Date(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            currentSchedule: mockSchedule || []
        };

        // 1. Planner Agent
        const plannerOutput = await this.planner.run(userMessage, context);
        console.log("compass Planner Decision:", plannerOutput);

        // 2. Regulator Agent
        const regulatorOutput = await this.regulator.run({ userMessage, plannerOutput }, context);
        console.log("heart Regulator Decision:", regulatorOutput);

        // 3. Scheduler Agent
        const schedulerOutput = await this.scheduler.run({ planner: plannerOutput, regulator: regulatorOutput }, context);
        console.log("calendar Scheduler Options:", schedulerOutput);

        // 4. Validator Agent (Audit each option)
        const validations: ValidatorOutput[] = [];
        for (const option of schedulerOutput.options) {
            const validation = await this.validator.run({ patch: option.patch, currentSchedule: context.currentSchedule || [] }, context);
            validations.push(validation);
        }
        console.log("shield Validator Audit:", validations);

        // 5. Final Summary Generator (The Voice)
        const summaryPrompt = `
        Context:
        - User Intent: ${plannerOutput.intent}
        - Strategy: ${plannerOutput.strategy}
        - Options Found: ${schedulerOutput.options.length}
        - Regulator Style: ${regulatorOutput.language_style}
        - Regulator Mode: ${regulatorOutput.response_mode}

        Task: Write a confirmation summary for the user.
        CONSTRAINTS:
        1. MAX 2 SENTENCES.
        2. NO WAFFLE ("Here are some options...").
        3. BE DIRECT.
        4. If Options > 0: "I found X options. [Brief detail]."
        5. If Impossible: "I cannot do that because [Reason]. Sacrifice?"

        Output: Pure String.
        `;

        const summary = await import('@/lib/ai/groq-client').then(m => m.generateAIResponse(summaryPrompt, 'SYSTEM_COACH', userId));

        return {
            planner: plannerOutput,
            regulator: regulatorOutput,
            scheduler: schedulerOutput,
            validation: validations,
            summary: summary.trim() // The generated 2-line summary
        };
    }
}
