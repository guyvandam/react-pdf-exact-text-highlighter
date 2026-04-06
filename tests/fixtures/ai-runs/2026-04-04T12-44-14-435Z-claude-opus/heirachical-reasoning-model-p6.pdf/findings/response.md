

Here are the main arguments and findings from this PDF page:

---

### 1. One-Step Gradient Approximation for HRM

The authors propose a memory-efficient training method: [a one-step approximation of the HRM gradient–using the gradient of the last state of each module and treating other states as constant](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=we%20propose%20a%20one-step%20approximation%20of%20the%20HRM%20gradient%E2%80%93using%20the%20gradient%20of%20the%20last%20state%20of%20each%20module%20and%20treating%20other%20states%20as%20constant). The resulting gradient path flows as: [Output head → final state of the H-module → final state of the L-module → input embedding](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=Output%20head%20%E2%86%92%20final%20state%20of%20the%20H-module%20%E2%86%92%20final%20state%20of%20the%20L-module%20%E2%86%92%20input%20embedding).

### 2. Computational Efficiency

This method is highly practical: [The above method needs O(1) memory, does not require unrolling through time, and can be easily implemented with an autograd framework such as PyTorch](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=The%20above%20method%20needs%20O(1)%20memory%2C%20does%20not%20require%20unrolling%20through%20time%2C%20and%20can%20be%20easily%20implemented%20with%20an%20autograd%20framework%20such%20as%20PyTorch).

### 3. Biological Plausibility

The approach is argued to be neuroscientifically motivated, since [each module only needs to back-propagate errors through its most recent local synaptic activity, this approach aligns well with the perspective that cortical credit assignment relies on short-range, temporally local mechanisms rather than on a global replay of activity patterns](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=each%20module%20only%20needs%20to%20back-propagate%20errors%20through%20its%20most%20recent%20local%20synaptic%20activity%2C%20this%20approach%20aligns%20well%20with%20the%20perspective%20that%20cortical%20credit%20assignment%20relies%20on%20short-range%2C%20temporally%20local%20mechanisms%20rather%20than%20on%20a%20global%20replay%20of%20activity%20patterns).

### 4. Fixed-Point Convergence of the L-Module

The theoretical justification assumes an idealized behavior where [the L-module repeatedly updates until its state](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=the%20L-module%20repeatedly%20updates%20until%20its%20state) z_L converges to a local fixed point. The [Implicit Function Theorem](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=Implicit%20Function%20Theorem) is then used to compute exact gradients of this fixed point with respect to the parameters without explicit backpropagation through time (BPTT).

### 5. Cost of Exact Gradients and the 1-Step Approximation

However, [Calculating the above gradient requires evaluating and inverting matrix](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=Calculating%20the%20above%20gradient%20requires%20evaluating%20and%20inverting%20matrix) (I − J_F), which is computationally expensive. To address this, [the so-called 1-step gradient](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=the%20so-called%201-step%20gradient) [approximates the series by considering only its first term](http://localhost:3456?pdf=heirachical-reasoning-model-p6.pdf#highlight=approximates%20the%20series%20by%20considering%20only%20its%20first%20term), i.e. (I − J_F)⁻¹ ≈ I, yielding a simple and efficient gradient formula.

---

**In summary**, this page presents a theoretically grounded yet computationally cheap training strategy for the Hierarchical Reasoning Model (HRM). It leverages the Implicit Function Theorem from Deep Equilibrium Model theory but avoids the expensive matrix inversion by using a 1-step Neumann series approximation — resulting in O(1) memory, no need for BPTT, and alignment with biologically plausible credit assignment mechanisms.