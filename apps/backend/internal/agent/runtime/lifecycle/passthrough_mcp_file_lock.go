package lifecycle

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
)

const passthroughMCPFileLockDirectory = "kandev/passthrough-mcp-locks"

// acquirePassthroughMCPFileLock serializes project MCP operations across
// backend processes. The lock lives in Kandev's temporary directory rather
// than the workspace, so it cannot become user project configuration.
func acquirePassthroughMCPFileLock(path string) (*os.File, error) {
	lockPath := passthroughMCPFileLockPath(path)
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o700); err != nil {
		return nil, fmt.Errorf("create passthrough MCP lock directory: %w", err)
	}
	file, err := openPassthroughMCPFileLock(lockPath)
	if err != nil {
		return nil, fmt.Errorf("open passthrough MCP lock: %w", err)
	}
	if err := lockPassthroughMCPFile(file); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("lock passthrough MCP file: %w", err)
	}
	return file, nil
}

func releasePassthroughMCPFileLock(file *os.File) error {
	if file == nil {
		return nil
	}
	unlockErr := unlockPassthroughMCPFile(file)
	closeErr := file.Close()
	if unlockErr != nil {
		return unlockErr
	}
	return closeErr
}

func passthroughMCPFileLockPath(path string) string {
	digest := sha256.Sum256([]byte(filepath.Clean(path)))
	name := hex.EncodeToString(digest[:]) + ".lock"
	return filepath.Join(os.TempDir(), passthroughMCPFileLockDirectory, name)
}
