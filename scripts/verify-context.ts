
import { ContextService } from '../src/lib/ai/context-service';

async function main() {
    // Hardcoded user ID for testing - replace with a valid ID from your DB
    const userId = "user_2rOGkCQ2Cg6C9y5y6y5y6y5y6y5";

    console.log("Fetching Liquid Context...");
    try {
        const context = await ContextService.getLiquidContext(userId);
        console.log("Context Fetched Successfully!");

        console.log("\n--- User ---");
        console.log(context.user);

        console.log("\n--- State ---");
        console.log(context.state);

        console.log("\n--- Schedule Stats ---");
        console.log(context.schedule.stats);

        const mode = ContextService.deriveSystemMode(context);
        console.log("\n--- Derived Mode ---");
        console.log(mode);

    } catch (error) {
        console.error("Error fetching context:", error);
    }
}

main();
