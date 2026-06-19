---
date: 2026-06-19
timestamp: 2026-06-19 12:30
tags: [技术, Cloudflare Blog, 每日抓取, 抓取]
source: https://blog.cloudflare.com/rss/
count: 8
full_content: 3
---

# ☁️ Cloudflare Blog Top 8 (2026-06-19)

## 思维导图

```mermaid
mindmap
  root((Cloudflare Blog))
    Iran's Internet is partia
    Bringing more agent harne
    Introducing the Cloudflar
    Route public traffic to p
    Enforcing the First AS in
    Announcing Claude Managed
    Cloudflare DMARC Manageme
    Defend against frontier c
```

## 列表（8 条，3 条含全文）

### 1. Iran's Internet is partially restored, Cloudflare Radar data shows
- **链接**: [https://blog.cloudflare.com/iran-internet-partially-restored-may-2026/](https://blog.cloudflare.com/iran-internet-partially-restored-may-2026/)
- **作者**: Lai Yi Ohlsen
- **发布**: Wed, 27 May 2026 17:25:00 GMT
- **简介**: Cloudflare Radar data confirms early indications of a partial Internet restoration in Iran, nearly three months after the shutdown began. Traffic spikes and DNS queries have risen, but network activity is currently just 

<details><summary>📄 全文（4021 字符，点击展开）</summary>

On Tuesday, May 26, Iranâs vice president __announced__

__Cloudflare Radar____Iranâs connectivity__

    
      

### The first shutdown

      
    
    Iranian citizens have experienced two national Internet shutdowns this year. The first began on January 8 around 16:30 UTC (20:00 local time), and we explored the impact seen over the first few days __in a blog post__

    
      

### The second shutdown

      
    
    In late February, as military strikes on Iran escalated, a second nationwide Internet shutdown began. That sweeping shutdown has persisted for nearly three months.

The shutdown began on February 28. On that date, __Cloudflare Radar observed____Iran____small amounts of Web and DNS traffic__

    
      

### Activity on May 26

      
    
    Our observations indicate that more traffic is now finally able to get through. Starting at around 11:00 UTC on May 26, 87 days after the second shutdown started, Cloudflare Radar observed a marked increase in both traffic and DNS queries.

    
      

#### Traffic increase

      
    
    Data for bytes transferred across Cloudflareâs network shows a brief spike at 11:45 UTC, followed by a steady increase starting at 12:00 UTC. This surge in activity is roughly 15x than the levels observed during the prior week. Following expected diurnal patterns, the traffic starts declining around 21:00 UTC, followed by an increase starting at May 27 3:00 UTC (6:30 local time). 

An increase in bytes transferred shows that a higher volume of data is successfully moving across Cloudflareâs network, which is a hopeful signal that a partial restoration is underway. 

    
      

#### Traffic volume by region

      
    
    Cloudflare Radarâs regional breakdowns, shown below, indicate that the vast majority of this new traffic is localized to Tehran, with 91.6% of HTTP requests originating from the capital city. While other regions show minor increases, they are not nearly as significant.

    
      

#### Traffic volume by networkÂ 

      
    
    Following an initial burst at 11:45 UTC, Internet providers TCI, IranCell, RighTel and MCCI each saw increases in traffic. Cloudflare Radar measures this traffic by ASN, the unique identifier assigned to an individual network or group of networks.Â  

    
      

#### DNS query increaseÂ 

      
    
    As shown in the graph below, queries to Cloudflareâs public DNS resolver (1.1.1.1) have also spiked. Because an increase in DNS traffic indicates that more users are requesting websites and services, this upward trend serves as a strong indicator that online access is returning. 

 
    
      

### Traffic has returned to 40% of previous levels

      
    
    These increases in traffic validates that a partial restoration of Iranâs Internet has taken place. However, though these increases in DNS queries and traffic are significant, they remain well below what we observed prior to either disruption. As shown in the graph below, at its peak on May 26, traffic had only returned to 40% of the maximum amount of activity observed so far in 2026.

          
          Network activity over the coming days will reveal whether traffic levels will successfully return to their pre-shutdown baselines. It should also be noted, however, that these changes could be temporary; as demonstrated in January, brief periods of recovery can quickly reverse.

    
      

### IPv6 remains impacted

      
    
    In January, __we reported____thus IPv6 traffic from Iran__

This is noteworthy because in contrast with IPv6, address space announcements for IPv4 have remained fairly consistent and stable throughout both major 2026 shutdowns in Iran. The fact that IPv4 addresses were not removed from global routing tables, combined with the complete loss of actual traffic, suggests that Iranâs shutdown was achieved through other technical means such as application filtering or whitelisting.   

*IPV6 address space dropped precipitously in January and has n

...（截断，原文 4564+ 字符）

</details>

### 2. Bringing more agent harnesses and frameworks to Cloudflare, starting with Flue
- **链接**: [https://blog.cloudflare.com/agents-platform-flue-sdk/](https://blog.cloudflare.com/agents-platform-flue-sdk/)
- **作者**: Thomas Gauvin
- **发布**: Wed, 17 Jun 2026 19:35:00 GMT
- **简介**: The Agents SDK is now a runtime any agent framework can build on. Today we're opening up the Agents SDK primitives, with Flue as a first framework targeting Agents SDK, and rolling out agents in the dashboard.

<details><summary>📄 全文（4022 字符，点击展开）</summary>

2026 is the year agent harnesses go to production. The software that controls the modelâs access to the outside world â harnesses like Codex, Claude Code, OpenCode, Pi, and Project Think â has matured to the point where teams are deploying agents as real, load-bearing infrastructure, not just prototypes.Â 

But building agents that survive production is hard.

We learned this firsthand building __Project Think__

A harness canât solve these problems on its own. Theyâre tied to state, storage and compute â which means theyâre dependent on the platform the agent runs on. Thatâs why weâre taking our learnings from hardening __Project Think____Cloudflare Agents SDK__

At the same time, a new layer has emerged above the harness. Frameworks like [Flue](https://flueframework.com/) wrap a harness with the project structures, conventions, integrations and developer experience that make agents productive to build.Â 

To solve these scaling challenges, thereâs a new, three-layer stack that is emerging for building production-grade AI. Here is how the pieces fit together, moving from the user-facing developer experience down to the underlying platform primitives:Â 

- **The framework (Flue)**â the project structure, the conventions, the integrations, the CLI and the developer experience for building agents.
 
- **The harness**- **(Pi, Project Think)**âÂ  the agentic loop that calls tools, reads results, manages context and keeps going until the task is done.
 
- **The runtime/platform**- **(the Cloudflare Agents SDK)**â the compute, state, and storage primitives everything above depends on
 

The Agents SDK is that bottom layer: it makes primitives like durable execution available to any harness and any framework. Flue, our new open-source framework from the team behind __Astro__

    
      

## Flue

      
    
    __Flue____Pi____OpenClaw__

This declarative model is what makes writing agents easy: hereâs a triage agent that intercepts a bug report, reproduces it in a sandbox, and diagnoses the issue in under 25 lines.

          
    
      

### The Flue developer experience

      
    
    Flueâs power comes from the fact that agents donât live in isolation. They are built to exist where your users already work, and integrate with your preferred tooling:

- **Anywhere agents**: Drop your agents into Slack, GitHub, Linear, or Discord with pre-configured Channels that handle event verification and dispatch boilerplate automatically.
 
- **Headless, but UI-ready**: Agents shouldnât live in a black box. Flue agents can run completely headlessly for background tasks, but- __@flue/react__
 
- **Ecosystem-ready**: Flue makes it easy to add and upgrade integrations with commands like- `flue add channel slack`, generating a Markdown blueprint that your own coding agent can read, modify, and cleanly integrate straight into your codebase.
 

      

### Designed for production, not just prototypes

      
    
    Moving an agent out of a local terminal and into a production ecosystem introduces traditional distributed systems failures. Host crashes, API timeouts from LLM providers, and unexpected restarts threaten to erase the short-term memory of a running agent turn.Â 

Flue solves this via Durable Streams.Â Each event in the execution history is added to an append-only log. By processing every prompt, tool response and model choice as an unchangeable ledger, an agentâs state is never volatile.Â If a process dies, another simply picks up the log and continues from the exact step it left off.Â 

    
      

### Deploy anywhere, including Cloudflare

      
    
    Flue is a multi-cloud framework. On __Node.js__

By running each Flue agent inside its own Durable Object, Cloudflare can automatically scale to as many agents as you need, each with their own isolated storage and compute. You donât have to provision servers, manage sticky sessions, or worry about noisy neighbors. And when Flue agents are deployed to Cloudflare, they get durabl

...（截断，原文 11112+ 字符）

</details>

### 3. Introducing the Cloudflare One stack: agent-powered deployment
- **链接**: [https://blog.cloudflare.com/cloudflare-one-stack/](https://blog.cloudflare.com/cloudflare-one-stack/)
- **作者**: AJ Gerstenhaber
- **发布**: Wed, 17 Jun 2026 13:00:00 GMT
- **简介**: The Cloudflare One stack is a library of agent skills that gives any AI agent the knowledge it needs to plan, deploy, and manage a Zero Trust environment — no migration calls required.

<details><summary>📄 全文（4021 字符，点击展开）</summary>

Adopting or migrating to a Zero Trust network architecture can be a daunting task. Before a single policy changes, teams have to recall how their network is actually built: which applications exist, their authentication and authorization constructs, how traffic flows between them, and any assumptions the current architecture makes. This hands-on process requires practitioners to decode the intent behind every security and routing policy in place.

Today, weâre releasing the Cloudflare One stack, a __set of skills__

Cloudflare has worked with thousands of customers through exactly this process. That repetition built expertise on where migrations stall, what questions come up every time, and what it takes to move forward. The Cloudflare One stack packages that expertise and makes it more accessible than ever.Â 

    
      

### The agent gap in network security

      
    
    Teams are already using agents to write code, triage alerts, and automate workflows. Organizations are increasingly asking for Cloudflare-provided tooling to help agents execute on security workflows. On their own, agents are not trained on the nuances of an organization's specific network topology or vendor configurations.

By providing prescriptive and authoritative guidance, organizations can layer this context into their existing toolkit to make better use of the security products they are already deploying.

Cloudflare has long been the easiest-to-deploy SASE vendor in the market. The stack extends that philosophy to agents: it gives them the context, tools, and structured reasoning they need to operate on your security infrastructure.

    
      

## What is the Cloudflare One stack?

      
    
    The Cloudflare One stack is __a collection of skills____any skill____Cloudflare One__

The stack was built by synthesizing hand-curated knowledge from employees with tens of thousands of hours of experience working with customers on Cloudflare One products. It contains tools for planning, managing, and implementing your user and agent security infrastructure on Cloudflare. It also contains handpicked logic for migrating from legacy vendors like __Zscaler__

When used in conjunction with the __Cloudflare code mode MCP server__

    
      

## Whatâs in the stack?

      
    
    The Cloudflare One stack ships as two lightweight skill files: cloudflare-one and cloudflare-one-migration. Together they cover migrating to, building an implementation for, managing, and troubleshooting your Cloudflare One deployment:

- **Remote access and VPN replacement**with Cloudflare Access
 
- **User, network, device, and data security**with Cloudflare Gateway
 
- **Connectivity**with Cloudflare Tunnel, Cloudflare Mesh, and Cloudflare WAN
 
- **Migration guidance**with explicit detail for moving from other SASE vendors
 
- **Network diagram interpretation and generation**, so you can visualize proposed changes to your network in a way that is easy for you and your team to understand
 
- **Vendor concept translation**, which maps concepts between SASE vendors to reduce the barrier to evaluating and switching providers
 
- **Troubleshooting and operations**, with the Digital Experience Monitoring (DEX) toolkit and automated rule recommendations
 

      

## How it works

      
    
    The stack is available in the __Cloudflare Skills__

The cloudflare-one skill covers general product guidance. For example, if you ask an agent for the best way to replace your VPN infrastructure with Cloudflare Tunnel or Cloudflare Mesh, the skill knows how to:

- Inventory your existing VPN applications and identify which connectivity model each requires 
- Map each application to the appropriate Cloudflare primitive â self-hosted Access application, Tunnel-connected service, or Mesh-connected network segment 
- Generate a recommended deployment sequence that minimizes disruption during cutover 
- Produce a configuration summary your team can review before making any changes 

The cl

...（截断，原文 6337+ 字符）

</details>

### 4. Route public traffic to private applications with Cloudflare
- **链接**: [https://blog.cloudflare.com/private-origins-dns-routing/](https://blog.cloudflare.com/private-origins-dns-routing/)
- **作者**: Enrique Somoza
- **发布**: Wed, 10 Jun 2026 13:00:00 GMT
- **简介**: Application Services for Private Origins is available now in closed beta. Route public hostnames to private IP origins over your existing IPsec, GRE, CNI, or Cloudflare Mesh paths. No public IPs or extra connector softwa

### 5. Enforcing the First AS in BGP AS_PATHs
- **链接**: [https://blog.cloudflare.com/enforce-first-as-bgp/](https://blog.cloudflare.com/enforce-first-as-bgp/)
- **作者**: Bryton Herdes
- **发布**: Wed, 03 Jun 2026 17:00:00 GMT
- **简介**: BGP is vulnerable to routing hijacks and path leaks that negatively impact traffic on the Internet. RPKI helps solve some of these problems, but for some forged paths, we need to rely on a simpler mechanism: First AS enf

### 6. Announcing Claude Managed Agents on Cloudflare
- **链接**: [https://blog.cloudflare.com/claude-managed-agents/](https://blog.cloudflare.com/claude-managed-agents/)
- **作者**: Mike Nomitch
- **发布**: Tue, 19 May 2026 13:00:00 GMT
- **简介**: Cloudflare has integrated with Anthropic's Claude Managed Agents to provide a fast, isolated execution environment for autonomous code delivery. This means builders can scale agent workflows globally while strictly contr

### 7. Cloudflare DMARC Management is now generally available
- **链接**: [https://blog.cloudflare.com/dmarc-management-ga/](https://blog.cloudflare.com/dmarc-management-ga/)
- **作者**: Ayush Kumar
- **发布**: Tue, 16 Jun 2026 13:00:00 GMT
- **简介**: Get unified visibility into your email authentication posture and reach full DMARC enforcement with deeper reporting, record analysis, and SPF audits free for every Cloudflare customer.

### 8. Defend against frontier cyber models: Cloudflare's architecture as customer zero
- **链接**: [https://blog.cloudflare.com/frontier-model-defense/](https://blog.cloudflare.com/frontier-model-defense/)
- **作者**: Rohit Chenna Reddy
- **发布**: Tue, 09 Jun 2026 06:00:00 GMT
- **简介**: In our post about Project Glasswing, we made the argument that the architecture around a vulnerability matters more than the speed of the patch. Here we walk through what that architecture looks like, the threats it defe
