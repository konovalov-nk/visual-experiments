# NemotronLabs VoiceChat: inside the stream

Visual-first Russian interactive explanation of the model architecture and training.
Open `index.html` directly, or serve the repository with `python3 -m http.server 8000`
and visit `/explanations/nemotronlabs-voicechat/`. No dependencies, build step,
microphone access, external scripts, or API calls.

## Scenes

- **Conversation:** animated signal paths, synchronized input/voice/tool lanes,
  step/scrub/play controls, and an interruption action. Tool-pending audio does
  not condition response generation; barge-in is unavailable in that phase.
- **Training:** annotated examples, target-token probabilities, three trainable
  logits, cross-entropy, gradient updates, loss history, and masked API results.
- **One frame:** an illustrative waveform, encoder features, fused inputs, two
  token channels, 31 acoustic indices, and output waveform on an 80 ms cadence.

## Accuracy and simplifications

Based on Balam et al., *NemotronLabs VoiceChat: An Open Full-duplex Speech-to-Speech
Model with Tool Calling Capabilities*, arXiv:2609.21967v2 (CC BY 4.0):
https://arxiv.org/html/2609.21967v2

- §§2.1–2.3: direct encoded-audio conditioning, auxiliary RNN-T, parallel text and
  function heads, streaming TTS and codec. Fusion coefficients are 1/1/2.
- §§3.1–3.2: independent backbone/TTS training, later RNN-T training with frozen
  backbone, PAD supervision, boundary losses, masked tool-result tokens.
- Appendix A: synthetic tool conversations and temporal augmentation.
- Appendix B: fast-decode/fast-inject, predefined acknowledgement during tool
  execution, incoming audio not conditioning the response, no barge-in then.

The overview groups text head and TTS to reduce diagram density. Its event axis
is not wall-clock time. Waveforms, features, codec values, weather, probabilities,
and token segmentation are illustrative, not measured model outputs. The toy
optimizer trains three logits for one sample (plain gradient descent), not an
11B network or the paper's full multi-task AdamW training. API result tokens have
zero loss; EOTR is a separate supervised boundary. PAD is not an immediate audio
stop. The complete TTS training recipe is not reproduced.

Keyboard: native tab navigation; left/right arrows switch scene tabs. Animation
is user-started, stops on scene changes/page hiding, and suppresses particle
motion under prefers-reduced-motion. On narrow screens the architecture drawing
can be scrolled horizontally to preserve legible labels.
