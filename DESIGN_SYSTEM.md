# PLANNRAI VISUAL DESIGN SYSTEM
## The Complete Visual Design Bible
Version 2.0

Purpose:
This document teaches AI how elite visual designers think.
The objective is not to make screens beautiful.
The objective is to make screens:
* Instantly understandable
* Emotionally calming
* Premium
* Modern
* Addictive to use
* Effortless to navigate

The user should never notice the design.
The user should notice how easy everything feels.

---

# PART 1: DESIGN PHILOSOPHY
Most designers decorate. Elite designers remove.
The best screen is not the one with the most elements.
The best screen is the one where nothing more can be removed.
Every visual element must justify its existence.
Before adding something ask: Why does this exist?
Before shipping ask: Can it be removed?

---

# PART 2: VISUAL HIERARCHY
The eye must follow a path. Users should never decide where to look. The design should decide.
Visual Priority Order:
1. Primary Action
2. Primary Information
3. Supporting Information
4. Metadata
5. Decorative Elements
Never reverse this order.

---

# PART 3: COLOR SYSTEM
Humans feel color before understanding content. Color is emotional.

## PlannrAI Brand Color
Primary Hue: 270°
Purple communicates: Intelligence, Creativity, Future, Premium Technology.
Avoid: Neon Purple, Gaming Purple, Cartoon Purple.
Target: Linear, Apple, Stripe, Notion. Not Discord.

## Color Architecture
Use: 10% Brand Color, 90% Neutral Colors.
Premium products use restraint.

## HSB MASTER SYSTEM
- **Primary Purple**: Hue 270, Saturation 65, Brightness 75
- **Background**: Hue 270, Saturation 10, Brightness 8
- **Card Surface**: Hue 270, Saturation 8, Brightness 12
- **Secondary Surface**: Hue 270, Saturation 12, Brightness 16
- **Hover State**: Brightness +4
- **Pressed State**: Brightness -6
- **Disabled State**: Saturation -80%, Brightness -20%

---

# PART 4: SPACING SYSTEM
Random spacing is forbidden. Every measurement must come from the scale.
Scale: 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128. Nothing else.

- **Micro Gap (4px)**: Icons and text.
- **Small Gap (8px)**: Related content.
- **Medium Gap (16px)**: Most component spacing.
- **Large Gap (32px)**: Card separation.
- **Section Gap (64px)**: Major layout separation.
- **Hero Gap (96px)**: Major visual breathing room.

---

# PART 5: GRID SYSTEM
- **Desktop (12 Columns)**: Gutter 24px, Margins 80px
- **Tablet (8 Columns)**: Gutter 16px, Margins 32px
- **Mobile (4 Columns)**: Gutter 16px, Margins 16px
Never design outside grid.

---

# PART 6: TYPOGRAPHY SYSTEM
Typography creates hierarchy. Not color. Not animation. Not effects. Typography.

**Primary Typeface**: Inter
**Fallback**: SF Pro Display

## Maximum Type Scale
- Display XL: 64
- Display: 48
- H1: 36
- H2: 30
- H3: 24
- Body Large: 18
- Body: 16
- Body Small: 14
- Caption: 12
- Micro: 11
Never exceed 9 text sizes.

## Font Weight System
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700
Never use: 100, 200, 800, 900.

## Line Heights
- Display: 110%
- Headings: 120%
- Body: 150%
- Small Text: 140%

---

# PART 7: BUTTON SYSTEM
Buttons are commitments. Users must instantly understand what happens next.

- **Primary Button**: Filled. One per screen.
- **Secondary Button**: Outlined. Alternative action.
- **Ghost Button**: Text only.
- **Danger Button**: Red. Rare.

## Button Heights
- Small: 36
- Medium: 44
- Large: 52
- Hero: 60

**Minimum Touch Target**: 48x48. Always.

---

# PART 8: CARD SYSTEM
Cards group meaning. Not content.
- **Card Radius**: 16px (Premium products: 12–20px)
- **Card Padding**: 24px (Never less than 16)
- **Card Border**: 1px Subtle.
- **Shadow Philosophy**: Almost invisible. Apple style. Use elevation through brightness. Not giant shadows.

---

# PART 9: ICON SYSTEM
Use one icon family only.
Recommended: Lucide or Phosphor
Never mix icon packs.
**Icon Sizes**: 16, 20, 24, 32, 48 (Default: 20px)

---

# PART 10: NAVIGATION SYSTEM
Maximum 6 Primary Tabs. Never exceed.
PlannrAI: Home, Mindspace, Calendar, Goals, Review, Coach Hub
Settings hidden. Not primary.

---

# PART 11: FORMS
Forms should feel invisible.
- **Field Height**: 48px
- **Label**: Above field. Never inside.
- **Placeholder**: Examples only. Never instructions.
- **Required Fields**: Minimum. Only ask what is needed now.

---

# PART 12: DROPDOWNS
Avoid whenever possible.
Decision hierarchy: Toggle -> Segmented Control -> Radio Group -> Dropdown -> Searchable Dropdown
Dropdown is never the first choice.

---

# PART 13: STATES
Every component must have: Default, Hover, Focused, Pressed, Disabled, Loading, Error, Success, Empty.
Every state must be designed.

---

# PART 14: ANIMATION SYSTEM
Animation communicates. Animation does not decorate.
- **Use for**: Navigation, Confirmation, State Changes, Hierarchy, Feedback
- **Avoid**: Floating Effects, Parallax, Infinite Loops, Attention-Seeking Motion
- **Duration Rules**: Fast (150ms), Normal (250ms), Slow (350ms), Maximum (500ms)

---

# PART 15: CONTRAST SYSTEM
- **Text**: Minimum 4.5:1
- **Critical Actions**: 7:1
Accessibility beats aesthetics. Always.

---

# PART 16: EMPTY STATES
Empty states are onboarding. Not blank screens.
Every empty state must: Explain, Guide, Motivate, Provide action.

---

# PART 17: LOADING STATES
Never use spinners alone. Use skeleton loaders. Users perceive skeletons as faster.

---

# PART 18: DARK MODE PHILOSOPHY
Never use pure black.
Use: #0B0B0F
Not: #000000
Pure black feels harsh. Dark gray feels premium.

---

# PART 19: PREMIUM CHECKLIST
Before approving any screen:
- Can something be removed?
- Can spacing improve?
- Can hierarchy improve?
- Can text be shorter?
- Can actions be clearer?
- Can clicks be reduced?
- Can the eye understand it in 3 seconds?
- Would Apple approve this?
- Would Linear approve this?
- Would Stripe approve this?
- Would it still look premium 5 years from now?
If not: Redesign.

---

# FINAL COMMANDMENT
Beauty is not the goal. Clarity is the goal.
When clarity becomes perfect, beauty appears automatically.

---

# PART 20: INTERACTION & STATE (V2.0 UPDATES)
- **Optimistic Updates**: UI must react instantly. Never wait for the network to show the user's action succeeded.
- **Transactional Undos**: For destructive actions (e.g., deleting branches or changing schedules), provide a 10-second confirmation barrier (Undo Toast) rather than interruptive modal dialogues.
- **Background Sync**: State must feel unified. If data changes on the server or via AI, use silent reactive primitives (`graphVersion`) to smoothly re-render the view without jarring hard refreshes.
- **Structural Loading**: Use dedicated skeleton cells that mimic the final content structure during long AI inferences. Never use blank screens or blocking spinners.
- **Intelligent Execution**: The AI Coach must classify changes by complexity. Simple logic uses an `AUTO_EXECUTE` ledger and a straightforward toast/English output. Complex, destructive, or ambiguous changes use `PROPOSE_OPTIONS` to force the user to choose their preferred outcome via distinct Option Cards. Never execute ambiguous multi-step updates without a proposal block.
