// Subtle, honest celebration system
// Rules: Never comparative, never exaggerated, never confetti

const CELEBRATION_MESSAGES = {
    taskComplete: [
        "That mattered.",
        "You showed up for this.",
        "Done. That's progress.",
        "One step forward.",
        "This counts.",
    ],
    goalProgress: [
        "You're investing in yourself.",
        "Small steps add up.",
        "That protected your long-term goal.",
        "Consistency, not perfection.",
    ],
    streakMaintained: [
        "Still going.",
        "Another day of showing up.",
        "You're here again. That's something.",
    ],
    lowEnergyWin: [
        "Even on hard days, something matters.",
        "You did what you could. That's enough.",
        "Rest is part of the journey.",
        "You're protecting your energy. Smart.",
    ],
    weeklyProgress: [
        "Another week observed.",
        "You're learning about yourself.",
        "Patterns are becoming clearer.",
    ],
};

export type CelebrationType = keyof typeof CELEBRATION_MESSAGES;

export function getCelebrationMessage(type: CelebrationType): string {
    const messages = CELEBRATION_MESSAGES[type];
    return messages[Math.floor(Math.random() * messages.length)];
}

// Crisis detection keywords (self-harm, suicidal ideation)
const CRISIS_KEYWORDS = [
    'kill myself',
    'want to die',
    'end my life',
    'suicide',
    'suicidal',
    'self harm',
    'self-harm',
    'hurt myself',
    'don\'t want to live',
    'no reason to live',
    'better off dead',
    'end it all',
];

export function detectCrisis(text: string): boolean {
    const lowerText = text.toLowerCase();
    return CRISIS_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export const CRISIS_RESPONSE = `
I hear you, and I want you to know that you matter. What you're feeling is real, and you don't have to face it alone.

Please consider reaching out to someone who can help:
• **National Suicide Prevention Lifeline**: 988 (US)
• **Crisis Text Line**: Text HOME to 741741
• **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/

You are not alone. There are people who care about you and want to help. ❤️

I'm here for planning and productivity, but right now, the most important thing is your wellbeing. Please reach out to a trusted person or professional.
`;
