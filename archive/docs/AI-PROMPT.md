Investigate how well each of these layers is effectively implemented. Document in the handof doc .  >"  MCP Orchestrator is the central brain. When a user clicks "Create Today's Post," the orchestrator interprets that intent, then sequences tool calls automatically: it queries brand memory → calls the content generator for a caption → calls Remotion for a video frame → pipes the result through FFmpeg for optimization → hands off to the publisher. The user never sees any of this.

Content Generation Layer uses an AI model (Claude via API) prompted with Lavira's brand voice — adventurous, warm, sustainability-conscious — to write captions, hashtags, and video scripts tailored to specific parks (Masai Mara, Amboseli, Tsavo, Samburu).

Video Pipeline (FFmpeg) is the workhorse. It takes any raw video clip of a safari drive, automatically crops it to 9:16 for Reels/TikTok, trims it to 15–30 seconds, adjusts speed, adds stabilization, compresses it, and generates multiple platform variants in one pass.

Branding Layer (Remotion) wraps every output in Lavira's visual identity — the logo watermark, Swahili/English subtitle overlays, animated title cards ("Masai Mara · 5-Day Safari"), and consistent color palette pulled from the website.

Publishing Layer connects to the social platforms and schedules posts. It can run fully ""

//////part two //////

You are working on an existing project called "Lavira Media Engine", a Node.js-based system for automated safari-themed social media content generation.

The system is already functional and includes:

* Media intake (image/video/audio)
* Processing engines (FFmpeg, Sharp)
* MCP server integration
* Caption generation
sharing automation
media integration + quality + integration techniques
* Scheduler and publishing modules

Your task is to INTELLIGENTLY IMPROVE and EXTEND the system.

---
I can't say much about the MCP capabilities I'm seeing. I intend to have an engine strong enough to create  a live image/post/card/table/graph/list/animation/video etc but get this clearly, I expect it to be especially excellent at generating images and videos. Show me where to advance/what to integrate/tweaks/etc to get to this solution. The MCP solution especially should easily accomplish such a task. {'ADD THIS TO LAVIRA-MEDIA-ENGINE MCP, =[ tHE engine should have the capabilities of image/video/animation/html/markdown/pdf etc. but an initial implementation of the image and/ video would be great, Ensure all MCP capability that is transfferrable to the lavira engine is implemented , Improve the UI and provide me a startup scrip that cleanly starts my project without conflicts, analyse the architecture,business logic,requirements implementation, and resources then map everything out into a packaging solution that caters for iferefnt devices/technologies-show me how to think when deciding on shipping/marketing/monetization strategy, Suggest on UI admin config settings where "THEY" can tweak some operational customization-map how it blends with the existing structure, document the software to legal/proessional/international standards , show me how impactffffful it would become on connecting this technology to the original lavira safaris organisation, document everything in the HANDOFFFFFF doc and erase implemented strategies, Provide me a script+readme of how to stage the entire software product on github in a private repo.]'} Don't implement much, analyze and document -I'm building from elsewhere
