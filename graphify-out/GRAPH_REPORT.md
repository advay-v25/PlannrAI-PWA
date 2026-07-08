# Graph Report - src  (2026-07-08)

## Corpus Check
- 373 files · ~250,637 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1750 nodes · 3970 edges · 109 communities (90 shown, 19 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- API Route Handlers (Core)
- Day Optimization Engine
- Conflict Resolution
- Coach Context Builder
- CRUD API Routes
- Calendar Layout UI
- Coach Apply/Validate Ops
- Calendar Page UI
- Settings Sections UI
- Home State & Error Pages
- Coach Chat UI
- Weekly Schedule Generation
- Encryption & Security Utils
- Daily Insight API
- Auth Pages & Rules Manager
- Home & Commitments UI
- Calendar Hooks & Agenda
- Emergency & Patch Contracts
- AI Agent Framework
- Settings API Schemas
- History & Profile UI
- Daily Grid & Watchdog
- Optimize Day API
- Modal Components
- Dashboard Cards UI
- Premium Calendar Styles
- AI Registry & Schemas
- AI Response Contracts
- Liquid Context Service
- App Layout & Goals Pages
- Lib Ai
- Lib Ai
- Lib Agents
- Lib User
- App Api
- Components Ui
- Stores Index
- Lib Scheduling
- Lib Security
- App App
- Components Onboarding
- Components Habit
- Lib Calendar
- Components Todos
- Lib Security
- Lib Services
- Lib Calendar
- Components Onboarding
- App Api
- Components Onboarding
- Components Ui
- Lib Calendar
- Components Reality
- Lib Calendar
- Types V1
- App Api
- App Layout
- Components Ui
- Components Deviation
- Components Next
- Components Ui
- Lib Calendar
- Lib Calendar
- Lib Calendar
- Components Ui
- Lib Scheduling
- App Api
- App Api
- Lib Ai
- Components Home
- Components Home
- Lib Coach
- Lib Intelligence
- App Api
- App Api
- Components Ai
- Lib Celebration
- Lib Date
- Lib Intelligence
- App Api
- Components Onboarding
- Components Onboarding
- Components Onboarding
- Lib Services
- Components Ai
- Components Ui
- Lib Ai
- Lib Scheduling
- App Legal
- App Legal
- Components Home
- Lib Scheduler
- Scripts Check
- Scripts Deep
- Scripts Test
- Types Todos
- App Api

## God Nodes (most connected - your core abstractions)
1. `secureApiRoute()` - 108 edges
2. `createClient()` - 106 edges
3. `apiSuccess()` - 90 edges
4. `apiError` - 87 edges
5. `cn()` - 75 edges
6. `Json` - 40 edges
7. `ScheduleBlock` - 38 edges
8. `apiClient` - 37 edges
9. `WeekOrchestrator` - 35 edges
10. `Goal` - 35 edges

## Surprising Connections (you probably didn't know these)
- `MiniCalendar()` --calls--> `cn()`  [EXTRACTED]
  app/app/calendar/page.tsx → lib/utils.ts
- `TaskCategories()` --calls--> `cn()`  [EXTRACTED]
  app/app/calendar/page.tsx → lib/utils.ts
- `AddBlockModal()` --calls--> `cn()`  [EXTRACTED]
  app/app/calendar/page.tsx → lib/utils.ts
- `DroppableHour()` --calls--> `cn()`  [EXTRACTED]
  components/calendar/week-grid.tsx → lib/utils.ts
- `GoalCardProps` --references--> `Goal`  [EXTRACTED]
  components/goals/goal-card.tsx → types/database.ts

## Import Cycles
- None detected.

## Communities (109 total, 19 thin omitted)

### Community 0 - "API Route Handlers (Core)"
Cohesion: 0.04
Nodes (57): GET, GET, GET, deleteAccountSchema, POST, POST, POST, autoPlaceSchema (+49 more)

### Community 1 - "Day Optimization Engine"
Cohesion: 0.06
Nodes (46): generateFlowStateFallback(), POST, POST, calculateWindDown(), DayOptimization, generateFallbackOptimization(), optimizeDayAI(), OptimizeDayResult (+38 more)

### Community 2 - "Conflict Resolution"
Cohesion: 0.06
Nodes (26): ConflictResolutionModalProps, ConflictResolver, ResolutionOption, DayContext, Energy, GenerateWeekArgs, GenerateWeekResult, Goal (+18 more)

### Community 3 - "Coach Context Builder"
Cohesion: 0.06
Nodes (62): normalizePatchForService(), buildCoachContext(), CoachContext, computeFreeSlots(), determineMinimalMode(), getWeekEnd(), getWeekStart(), markLockedBlocks() (+54 more)

### Community 4 - "CRUD API Routes"
Cohesion: 0.05
Nodes (35): POST, PreviewBodySchema, DELETE, GET, POST, DELETE, GET, PATCH (+27 more)

### Community 5 - "Calendar Layout UI"
Cohesion: 0.05
Nodes (37): CalendarLayout(), CalendarLayoutProps, ControlStackProps, FilterToggle(), StrategyOptionCard(), StrategyOptionCardProps, HabitGrid(), HabitGridProps (+29 more)

### Community 6 - "Coach Apply/Validate Ops"
Cohesion: 0.07
Nodes (31): POST, ApplyRequest, POST, POST, RequestSchema, POST, POST, POST (+23 more)

### Community 7 - "Calendar Page UI"
Cohesion: 0.07
Nodes (29): AddBlockModal(), CalendarPageInner(), MiniCalendar(), TaskCategories(), ViewMode, BLOCK_TYPE_META, BlockInspector(), BlockInspectorProps (+21 more)

### Community 8 - "Settings Sections UI"
Cohesion: 0.14
Nodes (26): Props, Props, Props, Props, cn(), Props, WorkPreferences(), Card (+18 more)

### Community 9 - "Home State & Error Pages"
Cohesion: 0.10
Nodes (20): HomeState, Props, State, GoalInterpretProps, GoalCard(), GoalCardProps, GoalStrategy, GoalStrategyWizard() (+12 more)

### Community 10 - "Coach Chat UI"
Cohesion: 0.12
Nodes (23): CoachChatProps, quickBubbles, CoachMessageBubble(), CoachMessageBubbleProps, renderInline(), renderMarkdown(), sanitizeContent(), CoachOptionCardProps (+15 more)

### Community 11 - "Weekly Schedule Generation"
Cohesion: 0.06
Nodes (23): generateStaticInterpretation(), generateWeeklySchedule(), POST, POST, POST, ConflictInfo, POST, DELETE (+15 more)

### Community 12 - "Encryption & Security Utils"
Cohesion: 0.10
Nodes (25): decrypt(), decryptFields(), encrypt(), encryptFields(), getEncryptionKey(), hash(), containsSqlPatterns(), DANGEROUS_PATTERNS (+17 more)

### Community 13 - "Daily Insight API"
Cohesion: 0.10
Nodes (19): DailyInsight, GET, insightCache, POST, requestSchema, POST, POST, POST (+11 more)

### Community 14 - "Auth Pages & Rules Manager"
Cohesion: 0.13
Nodes (19): CATEGORIES, PersonalRule, PersonalRulesManager(), ForgotPasswordPage(), LoginPage(), ResetPasswordPage(), SetPasswordContent(), ApiDiagnostics() (+11 more)

### Community 15 - "Home & Commitments UI"
Cohesion: 0.11
Nodes (19): HomePage(), Commitment, CommitmentsManager(), DAY_NUM_MAP, DAYS, DangerZone(), SectionId, SECTIONS (+11 more)

### Community 16 - "Calendar Hooks & Agenda"
Cohesion: 0.12
Nodes (21): AgendaViewProps, HabitStackCardProps, CalendarState, ViewMode, useCapacity(), calculateGoalCapacity(), CapacityResult, OptimizationContext (+13 more)

### Community 17 - "Emergency & Patch Contracts"
Cohesion: 0.10
Nodes (22): EmergencyService, CalendarPatch, CalendarPatchSchema, CoachActionTypeSchema, CoachOption, CoachOptionSchema, CoachPlanResponse, CoachPlanResponseSchema (+14 more)

### Community 18 - "AI Agent Framework"
Cohesion: 0.18
Nodes (16): BaseAgent, AgentContext, PlannerOutput, PlannerOutputSchema, RegulatorOutput, RegulatorOutputSchema, Sacrifice, SchedulerOutput (+8 more)

### Community 19 - "Settings API Schemas"
Cohesion: 0.09
Nodes (21): MealWindowSchema, POST, PreferencesUpdateSchema, PreviewRegenerateSchema, TimeStringSchema, MealWindowSchema, POST, PreferencesUpdateSchema (+13 more)

### Community 20 - "History & Profile UI"
Cohesion: 0.10
Nodes (10): ProfileAnalysis, RealityIntakeProps, ContextDebugger(), PageBackground(), CoachAnalytics, fetcher(), useCoachAnalytics(), apiClient (+2 more)

### Community 21 - "Daily Grid & Watchdog"
Cohesion: 0.13
Nodes (8): DailyGridProps, ProactiveInboxProps, ScheduleConflict, UseScheduleWatchdogProps, ConflictService, ConflictVerdict, ResolutionOption, ScheduleBlock

### Community 22 - "Optimize Day API"
Cohesion: 0.12
Nodes (15): OptimizeDayOutputSchema, POST, TimeBlock, POST, SignalSchema, API_ERROR_CODES, apiError, ApiErrorCode (+7 more)

### Community 23 - "Modal Components"
Cohesion: 0.13
Nodes (16): PatchPreviewModal(), PatchPreviewModalProps, ConflictInfo, GoalStrategyModal(), GoalStrategyModalProps, HabitStackModal(), HabitStackModalProps, HabitStackTile() (+8 more)

### Community 24 - "Dashboard Cards UI"
Cohesion: 0.12
Nodes (15): NOTE: needs_rescheduling is now handled via the proactive coach suggestion banne, CollapsedInsights(), CollapsedInsightsProps, DashboardCards(), DashboardCardsProps, HomeLayout(), HomeLayoutProps, LinearTimeline() (+7 more)

### Community 25 - "Premium Calendar Styles"
Cohesion: 0.12
Nodes (14): calendarAnimationVariants, PremiumCalendarState, usePremiumCalendar, BlockCard(), DroppableHour(), getBlockColors(), HOURS, PILLAR_COLORS (+6 more)

### Community 26 - "AI Registry & Schemas"
Cohesion: 0.09
Nodes (21): AIContext, AILimits, BASE_RULES, ChannelDef, CoachOutputSchema, DailyBriefingOutputSchema, GoalDecompositionSchema, GoalStrategyOutputSchema (+13 more)

### Community 27 - "AI Response Contracts"
Cohesion: 0.09
Nodes (21): AIResponse, CalendarOptionSchema, CanonicalPatchOp, CanonicalPatchOpSchema, ChannelType, CoachResponseSchema, FirstScheduleGenerator, GoalDecompositionSchema (+13 more)

### Community 28 - "Liquid Context Service"
Cohesion: 0.13
Nodes (10): ContextService, LiquidContext, MODE_CONFIGS, MOOD_NEGATIVE, MOOD_POSITIVE, ProtocolInput, routeToStrategy(), ScheduleMode (+2 more)

### Community 29 - "App Layout & Goals Pages"
Cohesion: 0.15
Nodes (11): GoalDetailPage(), GoalsPage(), AppLayout(), ErrorBoundary, QuickCaptureFAB(), RealtimeSync(), CommandMenu(), GoalCapacity (+3 more)

### Community 30 - "Lib Ai"
Cohesion: 0.14
Nodes (14): HabitStacks(), extractCoachResponse(), AI_SYSTEM_PROMPT, buildFeatureUserPrompt(), FEATURE_RULES, runAI(), safeJsonParse(), AIResponseSchema (+6 more)

### Community 31 - "Lib Ai"
Cohesion: 0.15
Nodes (12): GET, HabitOptimization, OptimizationResponse, OptimizeHabitsOutputSchema, runExpertStrategy(), ChatMessage, groqChat(), GroqError (+4 more)

### Community 32 - "Lib Agents"
Cohesion: 0.13
Nodes (15): POST, ContextBuilder, BlockType, CalendarChangeSchema, CalendarPatch, CalendarPatchSchema, EmotionalState, EnergyCost (+7 more)

### Community 33 - "Lib User"
Cohesion: 0.22
Nodes (8): UserMode, UserState, AnticipationService, AnticipationSignal, BASELINE_STATE, StateEngine, StateInputs, StateService

### Community 34 - "App Api"
Cohesion: 0.20
Nodes (9): IntakeActionSchema, POST, GET, GoalSuggestion, SuggestGoalsOutputSchema, SuggestionsResponse, extractFirstJsonObject(), JSONReliability (+1 more)

### Community 35 - "Components Ui"
Cohesion: 0.17
Nodes (9): CalendarSkeleton(), cn(), HomeTodos(), LoadingTimeout(), Skeleton(), SkeletonCard(), SkeletonProps, variants (+1 more)

### Community 36 - "Stores Index"
Cohesion: 0.13
Nodes (14): FAILURE_MODES, Step5FailureModes(), CoachMessage, CoachState, DailyLogState, defaultOnboardingData, FailureMode, HabitStack (+6 more)

### Community 37 - "Lib Scheduling"
Cohesion: 0.24
Nodes (9): OptimizationService, detectConflicts(), findNextAvailableSlot(), isSameDay(), rebuildSchedule(), resolveOverlaps(), ScheduleItem, SolverConstraints (+1 more)

### Community 38 - "Lib Security"
Cohesion: 0.21
Nodes (13): POST(), SecureApiOptions, checkMultipleRateLimits(), checkRateLimit(), cleanupExpiredEntries(), createRateLimitKey(), getClientIP(), LIMITS (+5 more)

### Community 39 - "App App"
Cohesion: 0.19
Nodes (8): CoachPageInner(), CoachChat(), CoachDashboard(), NowCard(), NowCardProps, DynamicBackground(), Variant, useCoach

### Community 40 - "Components Onboarding"
Cohesion: 0.17
Nodes (11): AddGoalModal(), PILLARS, CATEGORIES, GoalCategory, GoalImportance, PRESET_GOALS, Step3Goals(), EnergyDemand (+3 more)

### Community 41 - "Components Habit"
Cohesion: 0.21
Nodes (13): CreateHabitStack(), CreateHabitStackProps, CreateHabitStackWithAI(), CreateHabitStackWithAIProps, HabitStackWizard(), HabitStackWizardProps, Step, HabitInstance (+5 more)

### Community 42 - "Lib Calendar"
Cohesion: 0.22
Nodes (4): AnchorService, MealConfig, MealPlanner, TimeSlot

### Community 43 - "Components Todos"
Cohesion: 0.18
Nodes (10): COLOR_CLASSES, COLOR_DOT_CLASSES, DEFAULT_LABELS, KanbanColumn(), MindspaceBoard(), MindspaceCard(), useColorLabels(), RichTextEditor() (+2 more)

### Community 44 - "Lib Security"
Cohesion: 0.27
Nodes (12): GET(), AuditAction, AuditLogEntry, detectSuspiciousPatterns(), getIpFromRequest(), getUserAuditLogs(), logAIRequest(), logAuditEvent() (+4 more)

### Community 45 - "Lib Services"
Cohesion: 0.20
Nodes (6): CoachConversation, CoachMessage, MemoryFact, MemoryService, TODO: Implement actual LLM call to extract facts., ReactiveGoalService

### Community 46 - "Lib Calendar"
Cohesion: 0.20
Nodes (8): SchedulerContext, ConflictResult, ResolutionOption, ScheduleBlock, SchedulePatch, ValidationResult, SchedulerService, Database

### Community 47 - "Components Onboarding"
Cohesion: 0.22
Nodes (7): Step1Framing(), Step3Meals(), Step4Baseline(), Step4Commitments(), ACTIVITIES, Step5Body(), useOnboardingStore

### Community 48 - "App Api"
Cohesion: 0.20
Nodes (6): Block, findFreeSlot(), Goal, minutesToTime(), POST, timeToMinutes()

### Community 49 - "Components Onboarding"
Cohesion: 0.21
Nodes (7): OnboardingPage(), STEPS, Step1Identity(), Step2Rhythm(), ScheduleOption, STATUSES, Step6Generate()

### Community 50 - "Components Ui"
Cohesion: 0.21
Nodes (10): BlobBackground(), HorizonBackground(), MULT, PageBgColor, PageBgIntensity, PageBgVariant, pal(), PALETTE (+2 more)

### Community 51 - "Lib Calendar"
Cohesion: 0.31
Nodes (5): ExpertStrategyRequest, OptimiseWeekService, OptimizationContext, UserState, Profile

### Community 52 - "Components Reality"
Cohesion: 0.27
Nodes (9): ENERGY_LEVELS, EnergyCheck(), EnergyCheckProps, QuickLog(), QuickLogProps, STATUS_OPTIONS, TodayBlocksProps, TodayBlocksSummary() (+1 more)

### Community 54 - "Types V1"
Cohesion: 0.27
Nodes (9): AIInsight, BlockCompletion, EnergyCheckin, GoalRow, ProfileRow, ScheduleBlockRow, V1Goal, V1Profile (+1 more)

### Community 55 - "App Api"
Cohesion: 0.22
Nodes (5): ENERGY_BASED_SUGGESTIONS, GET, NextMoveGuidance, NextMoveOption, POST

### Community 56 - "App Layout"
Cohesion: 0.28
Nodes (5): metadata, viewport, GlobalInputSanitizer(), ThemeProvider(), ToastProvider()

### Community 58 - "Components Deviation"
Cohesion: 0.22
Nodes (6): DEVIATION_INFO, DeviationClassification, DeviationClassifierProps, DeviationPattern, DeviationSummaryProps, DeviationType

### Community 59 - "Components Next"
Cohesion: 0.25
Nodes (7): getIcon(), ICON_MAP, NextMoveCard(), NextMoveCardProps, NextMoveGuidance, NextMoveOption, NextMovePromptProps

### Community 60 - "Components Ui"
Cohesion: 0.25
Nodes (3): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState

### Community 61 - "Lib Calendar"
Cohesion: 0.33
Nodes (4): CanonicalPatch, CanonicalPatchSchema, PatchResult, PatchService

### Community 64 - "Components Ui"
Cohesion: 0.29
Nodes (4): Step5Permissions(), GlassSliderProps, GlassToggle(), GlassToggleProps

### Community 65 - "Lib Scheduling"
Cohesion: 0.36
Nodes (6): generateAIWeekPlan(), generateStaticWeekPlan(), isFree(), persistWeekPlan(), SENTINEL_IDS, WeekPlanResult

### Community 66 - "App Api"
Cohesion: 0.29
Nodes (4): PlanWeekSchema, POST, POST, MoodLevel

### Community 67 - "App Api"
Cohesion: 0.29
Nodes (5): DEVIATION_TYPES, DeviationClassification, DeviationType, GET, POST

### Community 69 - "Components Home"
Cohesion: 0.48
Nodes (5): CommandCenter(), CommandCenterProps, formatDuration(), getGreeting(), useTodos()

### Community 70 - "Components Home"
Cohesion: 0.38
Nodes (5): NotificationScheduler(), NotificationSchedulerProps, ScheduleBlock, NotifPermission, useNotifications()

### Community 71 - "Lib Coach"
Cohesion: 0.38
Nodes (4): ChannelRegistry, buildCoachContext(), envPath, main()

### Community 73 - "App Api"
Cohesion: 0.40
Nodes (4): DELETE, GET, POST, PUT

### Community 75 - "Components Ai"
Cohesion: 0.33
Nodes (3): AISuggestion, AISuggestionChipProps, AISuggestionsListProps

### Community 76 - "Lib Celebration"
Cohesion: 0.40
Nodes (4): CELEBRATION_MESSAGES, CelebrationType, CRISIS_KEYWORDS, detectCrisis()

### Community 77 - "Lib Date"
Cohesion: 0.53
Nodes (4): isValidISODate(), normalizeTime(), safeDateTime(), safeParseISO()

### Community 79 - "App Api"
Cohesion: 0.50
Nodes (3): GET, padTime(), toICSDateTime()

### Community 80 - "Components Onboarding"
Cohesion: 0.50
Nodes (3): calculateCapacity(), DayFrameVisualizer(), Step2Time()

### Community 81 - "Components Onboarding"
Cohesion: 0.40
Nodes (4): DAYS, Step3Anchors(), TEMPLATES, OnboardingCommitment

### Community 82 - "Components Onboarding"
Cohesion: 0.40
Nodes (4): GOAL_TEMPLATES, PILLARS, Step4Goals(), OnboardingGoal

### Community 83 - "Lib Services"
Cohesion: 0.50
Nodes (4): buildFeatureContext(), FeatureContext, FeatureContextOptions, timeToMinutes()

### Community 85 - "Components Ui"
Cohesion: 0.50
Nodes (3): Button, ButtonProps, buttonVariants

### Community 86 - "Lib Ai"
Cohesion: 0.50
Nodes (3): openRouterChat(), OpenRouterConfig, OpenRouterMessage

## Knowledge Gaps
- **517 isolated node(s):** `GET`, `DailyInsight`, `insightCache`, `GET`, `requestSchema` (+512 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `secureApiRoute()` connect `API Route Handlers (Core)` to `Day Optimization Engine`, `CRUD API Routes`, `Coach Apply/Validate Ops`, `Weekly Schedule Generation`, `Daily Insight API`, `Settings API Schemas`, `Optimize Day API`, `Lib Ai`, `Lib Ai`, `Lib Agents`, `App Api`, `Lib Security`, `Lib Security`, `App Api`, `App Api`, `App Api`, `App Api`, `Lib Ai`, `App Api`, `App Api`, `App Api`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `Json` connect `Lib Ai` to `API Route Handlers (Core)`, `Day Optimization Engine`, `Conflict Resolution`, `Coach Context Builder`, `Calendar Layout UI`, `Coach Apply/Validate Ops`, `Coach Chat UI`, `Daily Insight API`, `Auth Pages & Rules Manager`, `Calendar Hooks & Agenda`, `AI Agent Framework`, `History & Profile UI`, `Modal Components`, `Liquid Context Service`, `Lib Ai`, `App Api`, `Lib Security`, `Components Todos`, `Lib Security`, `Lib Services`, `Types V1`, `Lib Calendar`, `Lib Ai`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `createClient()` connect `CRUD API Routes` to `API Route Handlers (Core)`, `Day Optimization Engine`, `Weekly Schedule Generation`, `Encryption & Security Utils`, `Daily Insight API`, `Calendar Hooks & Agenda`, `Emergency & Patch Contracts`, `Daily Grid & Watchdog`, `Optimize Day API`, `Liquid Context Service`, `Lib Ai`, `Lib Agents`, `Lib User`, `App Api`, `Lib Scheduling`, `Lib Calendar`, `Lib Security`, `Lib Services`, `Lib Calendar`, `Lib Calendar`, `App Api`, `Lib Calendar`, `App Api`, `App Api`, `Lib Ai`, `Lib Intelligence`, `App Api`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **What connects `GET`, `DailyInsight`, `insightCache` to the rest of the system?**
  _519 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Route Handlers (Core)` be split into smaller, more focused modules?**
  _Cohesion score 0.044956140350877194 - nodes in this community are weakly interconnected._
- **Should `Day Optimization Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06050228310502283 - nodes in this community are weakly interconnected._
- **Should `Conflict Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.05674044265593561 - nodes in this community are weakly interconnected._