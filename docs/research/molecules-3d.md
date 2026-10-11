# Molecules in 3D (2026-10-11)

Drives: [Epic 5 · Task 5.15.1](../../proj-mgmt/epic-5-3d-semantic-space.md) (and its prerequisite 5.4.1.5).
Reproduce: `npx vitest run --config docs/research/experiments/vitest.research.config.ts molecules3d` (writes [results/molecules-3d.json](experiments/results/molecules-3d.json)).

## Question

In 2D, two related words (a p99 link) that touch bond into a rigid molecule (Feature 5.6), and molecules act as gravity wells (Task 5.15.2). Until now molecules dissolved on the switch to 3D and formed again only back in 2D. Two questions:

1. **Should 3D form molecules on its own?** 3D bodies are soft spheres that overlap a little all the time (2D boxes are rigid and rarely overlap), so "touching" needs a threshold. Which one keeps molecules about as pure as 2D's without costing layout fidelity?
2. **What does keeping 2D molecules in 3D cost?**

## Method

`SpaceSimulation` gained the 2D molecule model:
- `MoleculeGraph`, with sphere-based overlap relaxation (`relaxSphereOffsets`);
- shared mass-weighted acceleration;
- a rigid snap after each step;
- no collisions between members;
- molecule gravity (the force model already accepted molecule groups).

A linked pair bonds when its centres come closer than `bondContact` × the summed radii.

The experiment runs headless on the real vocabulary:
- **Layouts:** shape on desktop, shape on a portrait phone (0.7 scale, 2.1 aspect), orbits.
- **Boards:** five named-group boards (families 15, dense 24, six groups 24, days 7, numbers 10) and three random 40-word boards like Discovery's.
- **Starts:** 3 flat starts each, 1,500 steps.

It measures:
- molecules formed and the share of words bonded;
- **purity** (molecules whose words all come from one ground-truth group);
- Spearman layout fidelity (more negative is better);
- the worst overlap between members.

## Findings

**Spontaneous 3D bonding, shape layout on desktop.** The fidelity cell shows "with bonding / without bonding (contact 0)".

| Contact | Families 15 | Dense 24 | Six groups 24 | Days 7 | Numbers 10 | Random 40 (mean) |
|---|---|---|---|---|---|---|
| 1.0 (any overlap) | 22% bonded, −0.84 / −0.86 | 38%, −0.76 / −0.80 | 22%, purity 67% | 81%, **−0.30** / −0.97 | 40%, −0.76 / −0.96 | 15% |
| 0.9 | 13% | 17% | purity 67% | 43%, −0.61 | 27%, −0.81 | 8% |
| 0.8 | 13%, −0.85 | 8%, −0.77 | 8%, purity 100% | 38%, **−0.69** | 27%, −0.81 | 2% |
| 0.7 | 4% | 8% | 6% | 38%, −0.69 | 20%, −0.82 | 1% |

On a phone (tighter container) bonding is heavier: at contact 1, 90% of the days board bonded and its fidelity fell to −0.10. The orbits layout behaves the same way.

**Carried molecules** (the shipped behaviour): each group's first two words arrive bonded and touching, as a pair the player joined in 2D would, and 3D forms no new bonds.

| Layout | Families 15 | Dense 24 | Six groups 24 | Days 7 | Numbers 10 |
|---|---|---|---|---|---|
| Shape, desktop | −0.78 (−0.86 without) | −0.76 (−0.80) | −0.73 (−0.78) | −0.97 (−0.97) | −0.94 (−0.96) |
| Shape, phone | −0.76 (−0.82) | −0.61 (−0.67) | −0.67 (−0.69) | −0.95 (−0.96) | −0.94 (−0.94) |

Members never overlapped (worst overlap 0.00 in every run).

## Decision

**3D forms no new molecules (`bondContact: 0`); molecules built in 2D carry into 3D and back.**

- **Spontaneous bonding is all accident.** Players can't push words together in 3D (+ taps add words, hand mode navigates). Every 3D bond is therefore the layout settling, and on tight sets that freezes chunks mid-inflation. The shape preset's line and ring layouts broke: days −0.97 → −0.69 at contact 0.8, the setting that looked best on group boards. Four shape-preset fidelity tests (`tests/spaceFidelity.test.ts`) failed with it on.
- **Carried molecules are the player's construction.** They cost 0.00–0.08 of fidelity, the price of rigid pairs: 5 pairs among 15 words is a heavy case. They keep their halo and bonds, rigid motion, and gravity well.
- **Shipped visuals:** a halo in the molecule's hue behind each member, plus a bond line, so members at different depths still read as one unit ([screenshot](img/molecule-3d.png)).

## Limitations and follow-ups

- **Purity is measured only on named-group boards.** Random boards have no ground truth.
- **Untested gate for 3D accretion:** bond only once the layout has settled (kinetic energy low), or only between mutual nearest neighbours. This becomes relevant when 3D gets a way to move words (roadmap, Epic 5 · Task 5.15.5).
- **Molecules are not saved with sessions** (Task 5.6.4).
