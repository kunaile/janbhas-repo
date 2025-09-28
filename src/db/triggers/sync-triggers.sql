-- src/db/triggers/sync-triggers.sql

-- ============================================================================
-- MULTILINGUAL TRANSLATION SYNCHRONIZATION TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Author Translation Sync: Update articles when author translations change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_author_translations_to_articles()
RETURNS TRIGGER AS $$
BEGIN
  -- Update articles with new author local name for specific language
  UPDATE articles 
  SET 
    author_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE author_id = NEW.author_id 
    AND language_id = NEW.language_id
    AND deleted_at IS NULL;
  
  -- Log the number of articles updated
  RAISE NOTICE 'Updated author translation for % articles', 
    (SELECT COUNT(*) FROM articles 
     WHERE author_id = NEW.author_id 
       AND language_id = NEW.language_id 
       AND deleted_at IS NULL);
       
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_author_translations_trigger
  AFTER INSERT OR UPDATE ON author_translations
  FOR EACH ROW EXECUTE FUNCTION sync_author_translations_to_articles();

-- ----------------------------------------------------------------------------
-- Category Translation Sync: Update articles when category translations change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_category_translations_to_articles()
RETURNS TRIGGER AS $$
BEGIN
  -- Update articles with new category local name for specific language
  UPDATE articles 
  SET 
    category_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE category_id = NEW.category_id 
    AND language_id = NEW.language_id
    AND deleted_at IS NULL;
  
  -- Also update series with same category and language
  UPDATE series 
  SET 
    category_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE category_id = NEW.category_id 
    AND language_id = NEW.language_id
    AND deleted_at IS NULL;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_category_translations_trigger
  AFTER INSERT OR UPDATE ON category_translations
  FOR EACH ROW EXECUTE FUNCTION sync_category_translations_to_articles();

-- ----------------------------------------------------------------------------
-- Sub-Category Translation Sync: Update articles when sub-category translations change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_sub_category_translations_to_articles()
RETURNS TRIGGER AS $$
BEGIN
  -- Update articles with new sub-category local name for specific language
  UPDATE articles 
  SET 
    sub_category_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE sub_category_id = NEW.sub_category_id 
    AND language_id = NEW.language_id
    AND deleted_at IS NULL;
  
  -- Also update series with same sub-category and language
  UPDATE series 
  SET 
    sub_category_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE sub_category_id = NEW.sub_category_id 
    AND language_id = NEW.language_id
    AND deleted_at IS NULL;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_sub_category_translations_trigger
  AFTER INSERT OR UPDATE ON sub_category_translations
  FOR EACH ROW EXECUTE FUNCTION sync_sub_category_translations_to_articles();

-- ----------------------------------------------------------------------------
-- Tag Translation Sync: Update article_tags when tag translations change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_tag_translations_to_article_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- Update article_tags with new tag local name for articles in specific language
  UPDATE article_tags 
  SET 
    tag_local_name = NEW.local_name,
    updated_at = NOW(),
    updated_by = NEW.updated_by
  WHERE tag_id = NEW.tag_id 
    AND EXISTS (
      SELECT 1 FROM articles a 
      WHERE a.id = article_tags.article_id 
        AND a.language_id = NEW.language_id
        AND a.deleted_at IS NULL
    )
    AND article_tags.deleted_at IS NULL;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_tag_translations_trigger
  AFTER INSERT OR UPDATE ON tag_translations
  FOR EACH ROW EXECUTE FUNCTION sync_tag_translations_to_article_tags();

-- ============================================================================
-- ARTICLE INSERTION TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Populate denormalized multilingual fields on article insert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION populate_article_multilingual_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Populate author local name from translation table
  IF NEW.author_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.author_local_name
    FROM author_translations 
    WHERE author_id = NEW.author_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  -- Populate category local name from translation table
  IF NEW.category_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.category_local_name
    FROM category_translations 
    WHERE category_id = NEW.category_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  -- Populate sub-category local name from translation table
  IF NEW.sub_category_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.sub_category_local_name
    FROM sub_category_translations 
    WHERE sub_category_id = NEW.sub_category_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_article_multilingual_trigger
  BEFORE INSERT ON articles
  FOR EACH ROW EXECUTE FUNCTION populate_article_multilingual_fields();

-- ----------------------------------------------------------------------------
-- Populate denormalized multilingual fields on series insert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION populate_series_multilingual_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Populate author local name from translation table
  IF NEW.author_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.author_local_name
    FROM author_translations 
    WHERE author_id = NEW.author_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  -- Populate category local name from translation table
  IF NEW.category_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.category_local_name
    FROM category_translations 
    WHERE category_id = NEW.category_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  -- Populate sub-category local name from translation table
  IF NEW.sub_category_id IS NOT NULL AND NEW.language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.sub_category_local_name
    FROM sub_category_translations 
    WHERE sub_category_id = NEW.sub_category_id 
      AND language_id = NEW.language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_series_multilingual_trigger
  BEFORE INSERT ON series
  FOR EACH ROW EXECUTE FUNCTION populate_series_multilingual_fields();

-- ============================================================================
-- SERIES STATISTICS MANAGEMENT TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Update series statistics when articles change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_series_statistics()
RETURNS TRIGGER AS $$
DECLARE
  target_series_id uuid;
  old_series_id uuid;
BEGIN
  -- Determine which series to update based on operation
  IF TG_OP = 'DELETE' THEN
    target_series_id := OLD.series_id;
  ELSIF TG_OP = 'UPDATE' THEN
    target_series_id := NEW.series_id;
    old_series_id := OLD.series_id;
  ELSE -- INSERT
    target_series_id := NEW.series_id;
  END IF;
  
  -- Update current series statistics
  IF target_series_id IS NOT NULL THEN
    UPDATE series SET
      total_episodes = (
        SELECT COUNT(*) FROM articles 
        WHERE series_id = target_series_id 
          AND deleted_at IS NULL
      ),
      total_word_count = (
        SELECT COALESCE(SUM(word_count), 0) FROM articles 
        WHERE series_id = target_series_id 
          AND deleted_at IS NULL
      ),
      updated_at = NOW()
    WHERE id = target_series_id;
  END IF;
  
  -- Update old series statistics if article moved between series
  IF TG_OP = 'UPDATE' AND old_series_id IS NOT NULL AND old_series_id != target_series_id THEN
    UPDATE series SET
      total_episodes = (
        SELECT COUNT(*) FROM articles 
        WHERE series_id = old_series_id 
          AND deleted_at IS NULL
      ),
      total_word_count = (
        SELECT COALESCE(SUM(word_count), 0) FROM articles 
        WHERE series_id = old_series_id 
          AND deleted_at IS NULL
      ),
      updated_at = NOW()
    WHERE id = old_series_id;
  END IF;
  
  -- Handle episode reordering on DELETE
  IF TG_OP = 'DELETE' AND OLD.series_id IS NOT NULL AND OLD.episode_number IS NOT NULL THEN
    -- Reorder episodes to fill the gap
    UPDATE articles 
    SET 
      episode_number = episode_number - 1,
      updated_at = NOW()
    WHERE series_id = OLD.series_id 
      AND episode_number > OLD.episode_number
      AND deleted_at IS NULL;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_series_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_series_statistics();

-- ============================================================================
-- EPISODE NUMBER MANAGEMENT
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Auto-assign episode numbers for new episodes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_episode_number()
RETURNS TRIGGER AS $$
DECLARE
  next_episode integer;
BEGIN
  -- Only assign episode number if article is part of a series and episode_number is NULL
  IF NEW.series_id IS NOT NULL AND NEW.episode_number IS NULL THEN
    -- Get the next episode number for this series
    SELECT COALESCE(MAX(episode_number), 0) + 1 
    INTO next_episode
    FROM articles 
    WHERE series_id = NEW.series_id 
      AND deleted_at IS NULL;
    
    NEW.episode_number := next_episode;
    
    RAISE NOTICE 'Assigned episode number % to article % in series %', 
      next_episode, NEW.title, NEW.series_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assign_episode_number_trigger
  BEFORE INSERT ON articles
  FOR EACH ROW EXECUTE FUNCTION assign_episode_number();

-- ============================================================================
-- ARTICLE_TAGS DENORMALIZATION TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Populate tag denormalized fields on article_tags insert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION populate_article_tags_denormalized_fields()
RETURNS TRIGGER AS $$
DECLARE
  article_language_id uuid;
BEGIN
  -- Get the language of the article
  SELECT language_id INTO article_language_id
  FROM articles 
  WHERE id = NEW.article_id 
    AND deleted_at IS NULL;
  
  -- Populate tag name from tags table
  SELECT name INTO NEW.tag_name
  FROM tags 
  WHERE id = NEW.tag_id 
    AND deleted_at IS NULL;
  
  -- Populate tag local name from translation table
  IF article_language_id IS NOT NULL THEN
    SELECT local_name INTO NEW.tag_local_name
    FROM tag_translations 
    WHERE tag_id = NEW.tag_id 
      AND language_id = article_language_id
      AND deleted_at IS NULL
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_article_tags_denormalized_trigger
  BEFORE INSERT ON article_tags
  FOR EACH ROW EXECUTE FUNCTION populate_article_tags_denormalized_fields();

-- ============================================================================
-- PUBLICATION EVENT TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Auto-create publication events when publication status changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_publication_events()
RETURNS TRIGGER AS $$
BEGIN
  -- Track article publication status changes
  IF TG_TABLE_NAME = 'articles' THEN
    -- Publication status changed
    IF TG_OP = 'UPDATE' AND OLD.is_published != NEW.is_published THEN
      INSERT INTO publication_events (
        article_id, 
        event_type, 
        performed_by, 
        event_date,
        reason
      ) VALUES (
        NEW.id,
        CASE WHEN NEW.is_published THEN 'published' ELSE 'unpublished' END,
        NEW.updated_by,
        NOW(),
        'Status changed via content update'
      );
    END IF;
    
    -- Featured status changed
    IF TG_OP = 'UPDATE' AND OLD.is_featured != NEW.is_featured THEN
      INSERT INTO publication_events (
        article_id, 
        event_type, 
        performed_by, 
        event_date,
        reason
      ) VALUES (
        NEW.id,
        CASE WHEN NEW.is_featured THEN 'featured' ELSE 'unfeatured' END,
        NEW.updated_by,
        NOW(),
        'Featured status changed via content update'
      );
    END IF;
    
  -- Track series publication status changes
  ELSIF TG_TABLE_NAME = 'series' THEN
    -- Publication status changed
    IF TG_OP = 'UPDATE' AND OLD.is_published != NEW.is_published THEN
      INSERT INTO publication_events (
        series_id, 
        event_type, 
        performed_by, 
        event_date,
        reason
      ) VALUES (
        NEW.id,
        CASE WHEN NEW.is_published THEN 'published' ELSE 'unpublished' END,
        NEW.updated_by,
        NOW(),
        'Series status changed via content update'
      );
    END IF;
    
    -- Featured status changed
    IF TG_OP = 'UPDATE' AND OLD.is_featured != NEW.is_featured THEN
      INSERT INTO publication_events (
        series_id, 
        event_type, 
        performed_by, 
        event_date,
        reason
      ) VALUES (
        NEW.id,
        CASE WHEN NEW.is_featured THEN 'featured' ELSE 'unfeatured' END,
        NEW.updated_by,
        NOW(),
        'Series featured status changed via content update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_article_publication_events_trigger
  AFTER UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION track_publication_events();

CREATE TRIGGER track_series_publication_events_trigger
  AFTER UPDATE ON series
  FOR EACH ROW EXECUTE FUNCTION track_publication_events();

-- ============================================================================
-- UPDATED_AT TIMESTAMP MAINTENANCE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Auto-update updated_at timestamp on record changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER update_authors_updated_at 
  BEFORE UPDATE ON authors 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_author_translations_updated_at 
  BEFORE UPDATE ON author_translations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at 
  BEFORE UPDATE ON categories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_category_translations_updated_at 
  BEFORE UPDATE ON category_translations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_categories_updated_at 
  BEFORE UPDATE ON sub_categories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sub_category_translations_updated_at 
  BEFORE UPDATE ON sub_category_translations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at 
  BEFORE UPDATE ON tags 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tag_translations_updated_at 
  BEFORE UPDATE ON tag_translations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at 
  BEFORE UPDATE ON articles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_series_updated_at 
  BEFORE UPDATE ON series 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_article_tags_updated_at 
  BEFORE UPDATE ON article_tags 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_editors_updated_at 
  BEFORE UPDATE ON editors 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_languages_updated_at 
  BEFORE UPDATE ON languages 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_newsletter_subscribers_updated_at 
  BEFORE UPDATE ON newsletter_subscribers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER MAINTENANCE UTILITIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function to disable all sync triggers (for bulk operations)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION disable_sync_triggers()
RETURNS void AS $$
BEGIN
  -- Disable translation sync triggers
  ALTER TABLE author_translations DISABLE TRIGGER sync_author_translations_trigger;
  ALTER TABLE category_translations DISABLE TRIGGER sync_category_translations_trigger;
  ALTER TABLE sub_category_translations DISABLE TRIGGER sync_sub_category_translations_trigger;
  ALTER TABLE tag_translations DISABLE TRIGGER sync_tag_translations_trigger;
  
  -- Disable series statistics triggers
  ALTER TABLE articles DISABLE TRIGGER update_series_statistics_trigger;
  ALTER TABLE articles DISABLE TRIGGER assign_episode_number_trigger;
  
  -- Disable publication event triggers
  ALTER TABLE articles DISABLE TRIGGER track_article_publication_events_trigger;
  ALTER TABLE series DISABLE TRIGGER track_series_publication_events_trigger;
  
  RAISE NOTICE 'All sync triggers disabled for bulk operations';
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function to enable all sync triggers (after bulk operations)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enable_sync_triggers()
RETURNS void AS $$
BEGIN
  -- Enable translation sync triggers
  ALTER TABLE author_translations ENABLE TRIGGER sync_author_translations_trigger;
  ALTER TABLE category_translations ENABLE TRIGGER sync_category_translations_trigger;
  ALTER TABLE sub_category_translations ENABLE TRIGGER sync_sub_category_translations_trigger;
  ALTER TABLE tag_translations ENABLE TRIGGER sync_tag_translations_trigger;
  
  -- Enable series statistics triggers
  ALTER TABLE articles ENABLE TRIGGER update_series_statistics_trigger;
  ALTER TABLE articles ENABLE TRIGGER assign_episode_number_trigger;
  
  -- Enable publication event triggers
  ALTER TABLE articles ENABLE TRIGGER track_article_publication_events_trigger;
  ALTER TABLE series ENABLE TRIGGER track_series_publication_events_trigger;
  
  RAISE NOTICE 'All sync triggers enabled';
END;
$$ LANGUAGE plpgsql;
