"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { Check, Clock3, FileDown, MapPin, Rotate3d, UserRoundPlus } from "lucide-react";
import portrait from "@/public/photos/shubham-portrait.jpg";
import { reducedMotion } from "@/lib/motion";
import { vars } from "@/lib/utils";
import { buildVCard, vCardFilename } from "@/lib/vcard";
import type { ProfileView } from "@/lib/view";
import styles from "./HoloCard.module.css";

/** CSS module lookups are typed as possibly undefined, so they are joined here. */
function css(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

let queries: { fine: MediaQueryList; reduced: MediaQueryList } | undefined;

/** Tilt follows a mouse only: on touch it would fight the scroll. Cached, since it is asked per move. */
function canTilt(): boolean {
  queries ??= {
    fine: window.matchMedia("(hover: hover) and (pointer: fine)"),
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)"),
  };
  return queries.fine.matches && !queries.reduced.matches;
}

/** A fraction across the card, 0 to 1, as -1 to 1 from its centre. */
const unit = (fraction: number): number => Math.min(1, Math.max(-1, fraction * 2 - 1));

/** How far the card leans at its edges, in degrees, about each axis. */
const LEAN_X = 9;
const LEAN_Y = 12;
/** At the midpoint of a turn the card is lifted toward the viewer and tipped
 * forward a little, as a card turned over in the hand is. */
const LIFT = 64;
const TIP = 7;
/** The photograph drifts against the lean inside its window, so it reads as
 * set a little deeper than the frame around it. */
const DRIFT = 6;

/*
 * Springs. The lean is a little under critical damping, so it settles with a
 * hint of life rather than a wobble; the light is just over critical, so it
 * stays close to the pointer; a turn overshoots by about four degrees and
 * settles, which is what reads as a physical card landing.
 */
const LEAN = { stiffness: 160, damping: 17, mass: 0.8 };
const LIGHT = { stiffness: 210, damping: 25, mass: 0.6 };
const PRESENCE = { stiffness: 120, damping: 20, mass: 1 };
const TURN = { stiffness: 72, damping: 13, mass: 1 };

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

/** Wakes on each minute boundary, and when the tab comes back, which is when the clock can be stale. */
function subscribeToMinutes(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 20);
  };
  const onVisible = (): void => {
    if (document.visibilityState === "visible") onChange();
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const londonNow = (): string => LONDON.format(new Date());
const notOnServer = (): null => null;

/**
 * The time in London, or null on the server and during hydration. The
 * server cannot know when the page will be read, so it renders nothing and
 * the client fills the time in straight after, with no mismatch.
 */
function useLondonTime(): string | null {
  return useSyncExternalStore(subscribeToMinutes, londonNow, notOnServer);
}

/**
 * The candidate's photograph as a holographic ID badge, built as a small 3D
 * scene rather than a flat picture with a tilt.
 *
 * Each face is a stack of full-size layers standing off the plate at
 * different depths: the plate and its foil at the back, the photograph, the
 * type, a glass laminate that carries the light, then the location chip and
 * the flip control nearest the viewer. The stylesheet scales every layer back
 * by the same perspective, so at rest the card looks exactly as laid out, and
 * the depth only shows as parallax once it moves.
 *
 * Everything that moves is a spring following one of four values: where the
 * pointer is across the card, whether it is over it, and which face is up.
 * The springs write transforms straight to the elements, and the light's
 * position to three custom properties on the root, so a mouse crossing the
 * card never renders React. A turn lifts the card toward the viewer, tips it,
 * runs a band of light across the face as it passes the light, and lands with
 * a small overshoot. At rest it drifts very slightly (the stylesheet), which
 * the pause control and reduced motion both stop.
 *
 * The face that is turned away is inert, so a screen reader and the Tab key
 * only ever meet the side that can be seen.
 */
export function HoloCard({
  profile,
  variant = "sidebar",
}: {
  profile: ProfileView;
  variant?: "sidebar" | "sheet";
}) {
  const [flipped, setFlipped] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const toBack = useRef<HTMLButtonElement>(null);
  const toFront = useRef<HTMLButtonElement>(null);
  const pointerType = useRef("");
  const pending = useRef<{ focus: boolean } | null>(null);
  const sidebar = variant === "sidebar";

  // The four sources: the pointer, -1 to 1 across the card on each axis;
  // whether it is over the card; and the face-up angle.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const hover = useMotionValue(0);
  const face = useMotionValue(0);

  const leanX = useSpring(pointerX, LEAN);
  const leanY = useSpring(pointerY, LEAN);
  const lightX = useSpring(pointerX, LIGHT);
  const lightY = useSpring(pointerY, LIGHT);
  const presence = useSpring(hover, PRESENCE);
  const turn = useSpring(face, TURN);

  // 0 with either face up, 1 edge-on. The overshoot past either face is
  // clamped, so the card never dips below the panel as it lands.
  const arc = useTransform(turn, (angle) => Math.sin((Math.min(Math.max(angle, 0), 180) / 180) * Math.PI));
  const lift = useTransform(arc, (amount) => amount * LIFT);
  const rotateX = useTransform(() => -leanY.get() * LEAN_X + arc.get() * TIP);
  const rotateY = useTransform(() => leanX.get() * LEAN_Y + turn.get());

  const photoX = useTransform(leanX, (value) => value * -DRIFT);
  const photoY = useTransform(leanY, (value) => value * -DRIFT);

  // The glare is twice the card's size and centred on it, so moving it a
  // quarter of its own size puts its centre on the edge of the card.
  const glareX = useTransform(lightX, (value) => `${(value * 25).toFixed(2)}%`);
  const glareY = useTransform(lightY, (value) => `${(value * 25).toFixed(2)}%`);

  // A band of light crosses each face once as it turns through the light.
  const frontSheen = useTransform(turn, [0, 90], ["-100%", "100%"]);
  const frontSheenOpacity = useTransform(turn, [0, 45, 90], [0, 1, 0]);
  const backSheen = useTransform(turn, [90, 180], ["-100%", "100%"]);
  const backSheenOpacity = useTransform(turn, [90, 135, 180], [0, 1, 0]);

  // The shadow on the panel answers the lean, and spreads and softens while
  // the card is lifted mid-turn.
  const shadowX = useTransform(leanX, (value) => value * -9);
  const shadowY = useTransform(() => leanY.get() * -5 + arc.get() * 16);
  const shadowScale = useTransform(arc, (amount) => 1 + amount * 0.12);
  const shadowOpacity = useTransform(arc, (amount) => 1 - amount * 0.5);

  // The foil and the seal are painted from the light's position, so it is
  // written to custom properties the stylesheet reads. Subscriptions, not
  // renders: a spring settling never touches React.
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const write = (name: string, value: number): void => {
      element.style.setProperty(name, value.toFixed(2));
    };
    const stops = [
      lightX.on("change", (value) => {
        write("--holo-x", (value + 1) * 50);
      }),
      lightY.on("change", (value) => {
        write("--holo-y", (value + 1) * 50);
      }),
      presence.on("change", (value) => {
        write("--holo-o", value);
      }),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [lightX, lightY, presence]);

  // On a phone with no mouse, the card leans as the phone does, through the
  // same springs. Permission is never requested: a dialog for a decorative
  // effect is not worth it, so where orientation needs one (iOS) no events
  // arrive and nothing happens. Only while the card is on screen, and never
  // with reduced motion or the pause control. The rest position follows
  // slowly, so a phone held at a new angle comes back to centre, and small
  // tremors are ignored, so the card goes still rather than repainting for
  // a hand that is not moving.
  useEffect(() => {
    const element = root.current;
    if (element === null || reducedMotion()) return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    let visible = false;
    let rest: { beta: number; gamma: number } | null = null;
    let last = { x: 0, y: 0 };

    const settle = (): void => {
      rest = null;
      last = { x: 0, y: 0 };
      pointerX.set(0);
      pointerY.set(0);
      hover.set(0);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (!visible) settle();
    });
    observer.observe(element);

    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (!visible || event.beta === null || event.gamma === null) return;
      if (document.documentElement.dataset["motion"] === "paused") {
        if (rest !== null) settle();
        return;
      }
      rest ??= { beta: event.beta, gamma: event.gamma };
      rest.beta += (event.beta - rest.beta) * 0.015;
      rest.gamma += (event.gamma - rest.gamma) * 0.015;
      const x = Math.min(1, Math.max(-1, (event.gamma - rest.gamma) / 18));
      const y = Math.min(1, Math.max(-1, (event.beta - rest.beta) / 18));
      if (Math.abs(x - last.x) + Math.abs(y - last.y) < 0.03) return;
      last = { x, y };
      pointerX.set(x);
      pointerY.set(y);
      hover.set(0.65);
    };

    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      observer.disconnect();
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [pointerX, pointerY, hover]);

  // After a turn: if focus was on the side that is now inert it would fall
  // to the document, so it moves to the other side's flip button. With
  // reduced motion there is no turn, and the two faces cross-fade instead.
  useEffect(() => {
    const change = pending.current;
    if (change === null) return;
    pending.current = null;
    if (change.focus) (flipped ? toFront : toBack).current?.focus({ preventScroll: true });
    if (!reducedMotion()) return;
    const timing = { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
    (flipped ? back : front).current?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    (flipped ? front : back).current?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
  }, [flipped]);

  const turnTo = (next: boolean): void => {
    const leaving = (next ? front : back).current;
    pending.current = { focus: leaving?.contains(document.activeElement) ?? false };
    setFlipped(next);
    face.set(next && !reducedMotion() ? 180 : 0);
  };

  // Measured against the root, which never moves, rather than the card,
  // which does: measuring the card would feed its own lean back into it.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== "mouse" || !canTilt()) return;
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    pointerX.set(unit((event.clientX - box.left) / box.width));
    pointerY.set(unit((event.clientY - box.top) / box.height));
    hover.set(1);
    if (element.dataset["active"] === undefined) element.dataset["active"] = "";
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    pointerX.set(0);
    pointerY.set(0);
    hover.set(0);
    delete event.currentTarget.dataset["active"];
  };

  // On a touch screen the whole card turns on a tap, as a card in the hand
  // would. A mouse has the button, and a click there may be selecting text.
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (pointerType.current !== "touch" && pointerType.current !== "pen") return;
    if (event.target instanceof Element && event.target.closest("a, button") !== null) return;
    turnTo(!flipped);
  };

  const study = profile.study;

  return (
    <div
      ref={root}
      className={css(styles.root, sidebar ? styles.sidebar : styles.sheet)}
      data-flipped={flipped ? "" : undefined}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <motion.span
        aria-hidden
        className={styles.shadow}
        style={{ x: shadowX, y: shadowY, scale: shadowScale, opacity: shadowOpacity }}
      />

      <div className={styles.deal}>
        <div className={styles.float}>
          <motion.div className={styles.card} style={{ z: lift, rotateX, rotateY }}>
            <div
              ref={front}
              className={css(styles.face, styles.front)}
              inert={flipped}
              aria-hidden={flipped || undefined}
            >
              <div aria-hidden className={css(styles.layer, styles.plate)}>
                <span className={css(styles.foil, styles.plateFoil)} />
                <span className={styles.guilloche} />
              </div>

              <div className={css(styles.layer, styles.photo)}>
                <div className={styles.window}>
                  <div className={styles.reveal}>
                    <motion.div className={styles.drift} style={{ x: photoX, y: photoY }}>
                      {/* In the sidebar the photo is the largest thing above the fold, so
                        * it is preloaded; below 1024px that sidebar is hidden, and a 1px
                        * size hint makes a phone fetch the smallest file rather than a
                        * full one for an image it never shows. The sheet's copy loads
                        * when the sheet opens. */}
                      <Image
                        src={portrait}
                        alt={`Portrait of ${profile.name}`}
                        fill
                        preload={sidebar}
                        placeholder="blur"
                        sizes={
                          sidebar
                            ? "(min-width: 1280px) 23.5rem, (min-width: 1024px) 22rem, 1px"
                            : "(min-width: 640px) 36rem, 100vw"
                        }
                        className="object-cover object-[50%_24%]"
                      />
                      <span aria-hidden className={css(styles.foil, styles.photoFoil)} />
                    </motion.div>
                  </div>
                </div>
              </div>

              <div className={css(styles.layer, styles.type)}>
                <div className={styles.band}>
                  <div className={styles.bandText}>
                    <h2 className="font-prose min-w-0 pr-11 text-[1.375rem] leading-[1.625rem] font-semibold tracking-tight">
                      {profile.name}
                    </h2>
                    {study !== undefined && (
                      <p className="text-micro text-pretty">
                        <span className="block font-medium">{study.credential}</span>
                        <span className="block text-(--plate-muted)">{study.school}</span>
                      </p>
                    )}
                  </div>
                  <Seal className={styles.bandSeal} />
                </div>
              </div>

              <div className={css(styles.layer, styles.chipLayer)}>
                <p className={css(styles.chip, "text-micro font-medium")}>
                  <MapPin aria-hidden className="size-3.5" />
                  {profile.location}
                </p>
              </div>

              <Gloss
                x={glareX}
                y={glareY}
                presence={presence}
                sheen={frontSheen}
                sheenOpacity={frontSheenOpacity}
                glint
              />

              <div className={css(styles.layer, styles.controls)}>
                <button
                  ref={toBack}
                  type="button"
                  aria-pressed={false}
                  onClick={() => {
                    turnTo(true);
                  }}
                  className={css(styles.flip, "touch-target")}
                >
                  <Rotate3d aria-hidden className="size-4" />
                  <span className="sr-only">Show the back of the card</span>
                </button>
              </div>
            </div>

            <div
              ref={back}
              className={css(styles.face, styles.back)}
              inert={!flipped}
              aria-hidden={!flipped || undefined}
            >
              <div aria-hidden className={css(styles.layer, styles.backPlate)}>
                <span className={styles.guilloche} />
              </div>

              <div className={css(styles.layer, styles.backContent)}>
                <CardBack profile={profile} />
              </div>

              <Gloss
                x={glareX}
                y={glareY}
                presence={presence}
                sheen={backSheen}
                sheenOpacity={backSheenOpacity}
              />

              <div className={css(styles.layer, styles.controls)}>
                <button
                  ref={toFront}
                  type="button"
                  aria-pressed
                  onClick={() => {
                    turnTo(false);
                  }}
                  className={css(styles.flip, "touch-target")}
                >
                  <Rotate3d aria-hidden className="size-4" />
                  <span className="sr-only">Show the front</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/**
 * The laminate over each face: a still reflection, the glare that follows
 * the pointer, the band of light a turn sends across, and on the front the
 * single glint the card arrives with.
 */
function Gloss({
  x,
  y,
  presence,
  sheen,
  sheenOpacity,
  glint = false,
}: {
  x: MotionValue<string>;
  y: MotionValue<string>;
  presence: MotionValue<number>;
  sheen: MotionValue<string>;
  sheenOpacity: MotionValue<number>;
  glint?: boolean;
}) {
  return (
    <div aria-hidden className={css(styles.layer, styles.gloss)}>
      <motion.span className={styles.glare} style={{ x, y, opacity: presence }} />
      <motion.span className={styles.sheen} style={{ x: sheen, opacity: sheenOpacity }} />
      {glint && <span className={styles.glint} />}
    </div>
  );
}

function Seal({ size, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={css(styles.seal, className)}
      style={size === undefined ? undefined : vars({ "--seal": `${String(size)}px` })}
    >
      <span className={styles.sealGlyph}>S</span>
    </span>
  );
}

/** The reverse: what a recruiter acts on, on the dark brand plate. */
function CardBack({ profile }: { profile: ProfileView }) {
  const time = useLondonTime();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-8 items-center gap-2.5 pr-11">
        <Seal size={26} />
        <p className="font-prose truncate text-[1.0625rem] leading-6 font-semibold tracking-tight">
          {profile.name}
        </p>
      </div>

      <div className="mt-3 space-y-1.5 text-label">
        {profile.availability !== undefined && (
          <p className="flex items-start gap-2.5 text-white">
            <span
              aria-hidden
              className="bg-online mt-[6px] size-2 shrink-0 rounded-full shadow-[0_0_0_3px_rgb(16_185_129/0.25)]"
            />
            <span>
              <span className="sr-only">Availability: </span>
              {profile.availability}
            </span>
          </p>
        )}
        <p className="flex items-center gap-2.5 text-white/85">
          <Clock3 aria-hidden className="-ml-[3px] size-3.5 shrink-0" />
          <span>
            <span className="sr-only">Local time in London: </span>
            <time
              dateTime={time ?? undefined}
              className="inline-block min-w-[5ch] font-semibold text-white tabular-nums"
            >
              {time}
            </time>
            <span aria-hidden> in London</span>
          </span>
        </p>
      </div>

      <TargetRoles roles={profile.targetRoles} />

      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <SaveContact profile={profile} />
        <a
          href={profile.resume.href}
          download={profile.resume.filename}
          className={css(
            styles.action,
            styles.actionSolid,
            "group flex flex-col gap-1 rounded-xl bg-white px-3 py-2 text-brand-b",
          )}
        >
          <FileDown aria-hidden className={css(styles.actionIcon, "size-4")} />
          <span className="text-label leading-tight font-semibold">Download résumé</span>
        </a>
      </div>
    </div>
  );
}

/**
 * The roles he is looking for, on the side of the card a recruiter acts on.
 * Taken from profile.yaml's target_roles, so the card and the assistant say
 * the same thing.
 */
function TargetRoles({ roles }: { roles: string[] }) {
  if (roles.length === 0) return null;

  return (
    <section aria-label="Roles he is looking for" className="mt-3 border-t border-white/14 pt-2.5">
      <p className="text-micro text-white/80">Looking for</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {roles.map((role) => (
          <li
            key={role}
            className="rounded-full border border-white/22 bg-white/10 px-2.5 py-1 text-micro font-medium text-white"
          >
            {role}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Downloads a vCard built from the profile. The file is made on click, as a
 * Blob URL that is released once the download has had time to start, and the
 * icon ticks over for a moment to confirm it.
 */
function SaveContact({ profile }: { profile: ProfileView }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const save = (): void => {
    const url = URL.createObjectURL(
      new Blob([buildVCard(profile)], { type: "text/vcard;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = vCardFilename(profile);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaved(false);
    }, 1800);
  };

  return (
    <button
      type="button"
      onClick={save}
      className={css(
        styles.action,
        styles.actionGlass,
        "group flex flex-col items-start gap-1 rounded-xl border border-white/22 bg-white/10 px-3 py-2 text-left text-white",
      )}
    >
      {saved ? (
        <Check key="done" aria-hidden className="animate-pop size-4" strokeWidth={2.5} />
      ) : (
        <UserRoundPlus key="idle" aria-hidden className={css(styles.actionIcon, "size-4")} />
      )}
      <span className="text-label leading-tight font-semibold">Save contact</span>
      <span className="sr-only" aria-live="polite">
        {saved ? "Contact card downloaded" : ""}
      </span>
    </button>
  );
}
