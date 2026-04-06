Now I have all the citations. Here's the summary:

---

## Summary of Key Concepts

This PDF page describes a **one-step gradient approximation** for training a Hierarchical Reasoning Model (HRM). Here are the key concepts:

1. **One-Step Gradient Approximation**: The authors [propose a one-step approximation of the HRM gradient–using the gradient of the last state of each module and treating other states as constant](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=we%20propose%20a%20one-step%20approximation%20of%20the%20HRM%20gradient%E2%80%93using%20the%20gradient%20of%20the%20last%20state%20of%20each%20module%20and%20treating%20other%20states%20as%20constant). This simplifies training by only backpropagating through the final state of each module.

2. **Computational Efficiency**: This method is highly efficient — it [needs O(1) memory, does not require unrolling through time, and can be easily implemented with an autograd framework such as PyTorch](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=The%20above%20method%20needs%20O(1)%20memory%2C%20does%20not%20require%20unrolling%20through%20time%2C%20and%20can%20be%20easily%20implemented%20with%20an%20autograd%20framework%20such%20as%20PyTorch). This is a major advantage over standard backpropagation through time (BPTT).

3. **Biological Plausibility**: The approach is neuroscience-motivated, aligning with the view that [cortical credit assignment relies on short-range, temporally local mechanisms rather than on a global replay of activity patterns](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=cortical%20credit%20assignment%20relies%20on%20short-range%2C%20temporally%20local%20mechanisms%20rather%20than%20on%20a%20global%20replay%20of%20activity%20patterns).

4. **Deep Equilibrium Model Foundation**: The approximation is theoretically [grounded in the mathematics of Deep Equilibrium Models](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=grounded%20in%20the%20mathematics%20of%20Deep%20Equilibrium%20Mod) (DEQ), which use the Implicit Function Theorem (IFT) to bypass BPTT. In this idealized view, [the L-module repeatedly updates until its state](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=the%20L-module%20repeatedly%20updates%20until%20its%20state) converges to a local fixed point, after which the H-module performs a single update.

5. **Why the Approximation is Needed**: The exact IFT-based gradient is impractical because [calculating the above gradient requires evaluating and inverting matrix](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=Calculating%20the%20above%20gradient%20requires%20evaluating%20and%20inverting%20matrix) (I − J_F), which is computationally expensive. Instead, [the so-called 1-step gradient](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=the%20so-called%201-step%20gradient) approximates the Neumann series by taking only the first term (i.e., (I − J_F)⁻¹ ≈ I), yielding a simple and practical training rule.

The page also includes PyTorch pseudocode demonstrating both the HRM forward pass with the approximate gradient and a **deep supervision** training loop, where the model is unrolled for multiple supervision steps with detached states between them.