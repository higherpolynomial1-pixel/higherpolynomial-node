-- Add conversion_status column to track HLS conversion progress
-- Run this migration to add automatic HLS conversion support

-- Step 1: Add columns to course_videos table
ALTER TABLE course_videos 
ADD COLUMN conversion_status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') 
DEFAULT 'pending'
COMMENT 'Tracks HLS conversion status: pending=not started, processing=converting, completed=done, failed=error, skipped=already HLS';

ALTER TABLE course_videos 
ADD COLUMN original_video_url VARCHAR(500) NULL
COMMENT 'Original MP4 URL before HLS conversion (for backup)';

-- Step 2: Add columns to courses table
ALTER TABLE courses 
ADD COLUMN video_conversion_status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') 
DEFAULT 'pending'
COMMENT 'Tracks HLS conversion status for course intro video';

ALTER TABLE courses 
ADD COLUMN original_video_url VARCHAR(500) NULL
COMMENT 'Original MP4 URL before HLS conversion (for backup)';

-- Step 3: Add indexes
CREATE INDEX idx_conversion_status ON course_videos(conversion_status);
CREATE INDEX idx_video_conversion_status ON courses(video_conversion_status);
