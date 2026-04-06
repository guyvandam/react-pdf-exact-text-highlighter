Now I have all the citations I need. Here's the explanation:

---

## Methodology: Hierarchical Reasoning Model (HRM) with One-Step Gradient Approximation

This PDF describes an efficient training methodology for a **Hierarchical Reasoning Model (HRM)**, which consists of two modules: a low-level (L-module) and a high-level (H-module).

### Core Proposal

The authors [propose a one-step approximation of the HRM gradient–using the gradient of the last state of each module and treating other states as constant](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=we%20propose%20a%20one-step%20approximation%20of%20the%20HRM%20gradient%E2%80%93using%20the%20gradient%20of%20the%20last%20state%20of%20each%20module%20and%20treating%20other%20states%20as%20constant). This means that instead of backpropagating through the entire unrolled computation history, only the final state of each module is differentiated, while all prior states are treated as constants (i.e., detached from the computation graph).

### Gradient Path

The simplified gradient path follows a clean chain: [Output head → final state of the H-module → final state of the L-module → input embedding](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=Output%20head%20%E2%86%92%20final%20state%20of%20the%20H-module%20%E2%86%92%20final%20state%20of%20the%20L-module%20%E2%86%92%20input%20embedding). This dramatically simplifies the backward pass.

### Computational Efficiency

A key advantage is that [the above method needs O(1) memory, does not require unrolling through time, and can be easily implemented with an autograd framework such as PyTorch](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=The%20above%20method%20needs%20O(1)%20memory%2C%20does%20not%20require%20unrolling%20through%20time%2C%20and%20can%20be%20easily%20implemented%20with%20an%20autograd%20framework%20such%20as%20PyTorch). This is a significant improvement over standard backpropagation through time (BPTT), which requires memory proportional to the number of time steps.

### Biological Plausibility

The approach is also motivated by neuroscience: it aligns with the view that [cortical credit assignment relies on short-range, temporally local mechanisms rather than on a global replay of activity patterns](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=cortical%20credit%20assignment%20relies%20on%20short-range%2C%20temporally%20local%20mechanisms%20rather%20than%20on%20a%20global%20replay%20of%20activity%20patterns). Each module only needs to backpropagate errors through its most recent local synaptic activity.

### Theoretical Foundation in Deep Equilibrium Models

The approximation is [grounded in the mathematics of Deep Equilibrium Models (DEQ)](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=grounded%20in%20the%20mathematics%20of%20Deep%20Equilibrium%20Mod-%20els%20(DEQ)), which use the Implicit Function Theorem (IFT) to bypass BPTT. The idea is that during each high-level cycle, [the L-module repeatedly updates until its state](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=the%20L-module%20repeatedly%20updates%20until%20its%20state) converges to a local fixed point. The H-module then performs a single update using this converged state.

### The 1-Step Approximation

Computing the exact gradient via the IFT requires inverting a matrix `(I − J_F)`, which is expensive. Using the Neumann series expansion, the **1-step gradient** [approximates the series by considering only its first term](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=approximates%20the%20series%20by%20considering%20only%20its%20first%20term), i.e., `(I − J_F)⁻¹ ≈ I`. This yields simple, direct gradient expressions (Equation 2 in the paper) that avoid the costly matrix inversion while still providing a useful training signal.

### Training with Deep Supervision

The pseudocode (Figure 4) shows that training uses **deep supervision**: the model is run for multiple supervision steps, with each step producing an output that is compared against the true label via softmax cross-entropy loss. The state is detached between steps so gradients don't flow across supervision boundaries.