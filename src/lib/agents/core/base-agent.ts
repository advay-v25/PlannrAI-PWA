import { AgentContext } from './types';

export abstract class BaseAgent<TInput, TOutput> {
    abstract name: string;

    // Core execution method
    abstract run(input: TInput, context: AgentContext): Promise<TOutput>;

    // Optional: Log execution
    protected log(message: string, data?: any) {
        console.log(`[${this.name}] ${message}`, data || '');
    }
}
