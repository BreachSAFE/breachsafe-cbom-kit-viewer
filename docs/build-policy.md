# Container build policy

## Table of contents

1. [Rule](#rule)
2. [Rationale](#rationale)
3. [Enforcement](#enforcement)
4. [Changing the policy](#changing-the-policy)

## Rule

Container workflows publish the standard `linux/amd64` image. They must not install or use
QEMU and must not execute build or compilation steps through architecture emulation.

## Rationale

The frontend is an architecture-neutral static application. Emulated compilation makes the
release slower and less predictable without improving the application artifact. A standard
image also keeps the private viewer dependency simple for QuReddy App.

## Enforcement

The `Container Build Policy` workflow rejects repository workflows that configure QEMU or an
ARM publish platform. Docker Desktop can run the standard image on supported Intel and Apple
Silicon Macs through its normal compatibility behavior.

## Changing the policy

Native multi-architecture publishing requires a focused architecture decision and native
builders for every target. Do not restore emulated builds as a shortcut.
