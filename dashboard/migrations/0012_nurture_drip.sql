-- Add nurture drip tracking columns for free check tool users
-- Day 14: educational email (what drives the AEO score)
-- Day 30: conversion email (paid audit CTA)

ALTER TABLE users ADD COLUMN nurture_day14_sent INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN nurture_day30_sent INTEGER DEFAULT NULL;
