import test from "node:test";
import assert from "node:assert/strict";
import { defaultAboutPageContent, validateAboutPageContent } from "../src/lib/about-page-content";

test("About Page defaults preserve the existing twelve process steps and sequence", () => {
  assert.equal(defaultAboutPageContent.process.steps.length, 12);
  assert.equal(defaultAboutPageContent.process.steps[0].title, "Fabric Selection");
  assert.equal(defaultAboutPageContent.process.steps.at(-1)?.title, "Final Detailing & Finishing");
  assert.deepEqual(defaultAboutPageContent.process.steps.map(step => step.number), Array.from({length:12}, (_,i)=>String(i+1).padStart(2,"0")));
  assert.equal(validateAboutPageContent(defaultAboutPageContent), true);
});

test("About Page validation rejects external CTAs, unsafe images and broken fixed highlight layout", () => {
  const content = structuredClone(defaultAboutPageContent);
  content.hero.ctaHref = "https://example.com";
  assert.equal(validateAboutPageContent(content), false);
  const second = structuredClone(defaultAboutPageContent);
  second.process.steps[0].image = "../../secret.jpg";
  assert.equal(validateAboutPageContent(second), false);
  const third = structuredClone(defaultAboutPageContent);
  third.highlights.items.pop();
  assert.equal(validateAboutPageContent(third), false);
});

test("hidden process steps and team records remain valid editable content", () => {
  const content = structuredClone(defaultAboutPageContent);
  content.process.steps[1].visible = false;
  content.team.members.push({id:"person-1",name:"Artisan",role:"Artist",photo:"/images/products/ivory-peacock.webp",bio:"",visible:true});
  assert.equal(validateAboutPageContent(content), true);
});
