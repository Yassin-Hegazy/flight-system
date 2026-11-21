# aeron: brand and interface rules

This document defines the visual identity of the aeron web application and the rules every screen follows. The tokens are implemented in `apps/web/app/globals.css` (colours, corners, shadow) and `apps/web/components/ui.ts` (cards, buttons, labels).

## 1. Colour

| Token | Value | Role |
| --- | --- | --- |
| Navy | `#072d50` | The brand ink: text, headings, the header, sidebars, the footer, emphasis cards, secondary buttons. |
| Pink | `#fe5c8d` | Action. The primary button of a view, focus rings, the logo dot and one brand moment on the landing page (the "Fly happier." highlight). |
| Teal | `#dbf2fc` | The page background. |
| White | `#ffffff` | Cards. |
| Ice | `#f4fbff` | Surfaces inside a card. |
| Line | `#b5d8e9` | Borders and dividers. |
| Navy soft | `#0c4676` | Secondary text. |
| Mist | `#8fc9e0` | Secondary text on navy. |
| Blush | `#ffe0ea` | The soft background of an irreversible action (cancel a flight). |
| Danger | `#b8124a` | Errors and the confirm button of an irreversible action. |

Rules:

1. Pink marks what can be done, never decoration. Prices, arrows, accent bars, selected states and headings are not pink.
2. A selected item on navy (navigation, toggles) is white with navy text.
3. One primary (pink) button per view where possible. Further actions are secondary (navy) or quiet (white).
4. An action repeated on every row of a list (View, Manage, Select flight, E-ticket) is secondary (navy), never pink: a column of pink buttons has no primary left.
5. Text on a navy surface is white or mist, never navy. Prices on navy cards are white.
6. The illustrations in the picture book use the full palette; they are artwork, not interface.

## 2. Type

The typeface is Inter.

| Use | Size and weight | Case |
| --- | --- | --- |
| Landing headline | `clamp(2.25rem, 9.6vw, 70px)`, extra bold | Upper case: the only upper-case headline |
| Page title (h1) | `clamp(2.25rem, 5vw, 56px)`, extra bold | Sentence case |
| Section title (h2) | 24–28px, extra bold | Sentence case |
| Overline | 11px, bold, tracked | Upper case |
| Body | 15–17px, medium | Sentence case |
| Field label | 13px, semi bold | Sentence case |
| Navigation and buttons | 13–15px, bold | Sentence case |

## 3. Shape

| Element | Corners |
| --- | --- |
| Buttons, chips, navigation items, badges | Pill (`rounded-full`) |
| Cards | 22px (`rounded-card`) |
| Surfaces inside a card | 14px (`rounded-inset`) |
| Form fields and the search rail | 12px (`rounded-field`) |

A control joined to the search rail takes the rail's corners, so the rail reads as one object.

## 4. Components

- **Card:** white, hairline border, 22px corners (`CARD`).
- **Emphasis card:** navy (`CARD_DARK`); at most one or two per screen.
- **Buttons:** primary (pink), secondary (navy), quiet (white with a hairline), danger (red), in two heights: 44px inside cards and tables, 52px for a page's main action.
- **Overline:** the small upper-case label above a heading (`OVERLINE`).

## 5. Motion

Movement explains a change (the picture book's swing, the plane's flight) and never only decorates. With reduced motion requested, every change is immediate.
