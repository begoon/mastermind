# Mastermind Guesser

A browser game where the computer guesses *your* secret Mastermind code.
Plain HTML and JavaScript, no build step, no dependencies. Works on desktop
and mobile.

## How to play

1. Open `index.html` in a browser (or serve the folder with any static server).
2. Think of a secret code: 4 digits, each from 1 to 6, repeats allowed
   (1296 possible codes).
3. The computer shows a guess. Tell it how many **bulls** (right digit, right
   place) and **cows** (right digit, wrong place) it scored.
4. Repeat until it answers with 4 bulls. It never needs more than 5 guesses.

Enter the score by tapping the number chips under each field, or type both
numbers and press Enter.

## Impossible and dishonest answers

The game checks every answer before using it:

- Values outside 0–4, or bulls + cows above 4, are rejected.
- 3 bulls and 1 cow is rejected as logically impossible.
- An answer that no code could produce, given your earlier answers, is
  rejected with an explanation. Use **Undo** to step back and correct a
  previous answer.

## Algorithm

The guesser uses [Knuth's five-guess algorithm](https://en.wikipedia.org/wiki/Mastermind_(board_game)#Worst_case:_Five-guess_algorithm) (1977):

1. Start with all 1296 codes as candidates.
2. For every possible guess, partition the candidates by the feedback each
   would return. The largest partition is that guess's worst case.
3. Play the guess with the smallest worst case (minimax). Ties prefer a guess
   that is itself still a candidate, then the lexicographically smallest.
4. Eliminate every candidate inconsistent with the real feedback and repeat.

Across all 1296 secrets this solves every code in at most 5 guesses, 4.476
on average. The implementation is a JavaScript port of the Zig `Game` struct
from a [companion multi-language solver](knuth/README.md) (Python, V and Zig) and produces the
same guess sequence as those versions.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup and styles, including the mobile layout and dark mode |
| `script.js` | Knuth solver (`Game` class) and the UI logic |

## License

MIT, see [LICENSE](LICENSE).
