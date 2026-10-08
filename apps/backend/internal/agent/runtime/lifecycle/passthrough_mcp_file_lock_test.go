package lifecycle

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPassthroughMCPFileLockDirectoryUsesUserCache(t *testing.T) {
	cacheDir := t.TempDir()
	expected := filepath.Join(cacheDir, passthroughMCPFileLockDirectory)
	setPassthroughMCPFileLockCacheDir(t, cacheDir)
	if runtime.GOOS == "plan9" {
		expected = filepath.Join(cacheDir, "lib", "cache", passthroughMCPFileLockDirectory)
	}

	got, err := passthroughMCPFileLockDirectoryPath()

	require.NoError(t, err)
	require.Equal(t, expected, got)
}

func TestPassthroughMCPFileLockPathUsesCanonicalTarget(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation is not reliably available on Windows CI")
	}
	cacheDir := t.TempDir()
	setPassthroughMCPFileLockCacheDir(t, cacheDir)
	root := t.TempDir()
	realWorkspace := filepath.Join(root, "real")
	aliasWorkspace := filepath.Join(root, "alias")
	require.NoError(t, os.MkdirAll(filepath.Join(realWorkspace, ".pi"), 0o700))
	require.NoError(t, os.Symlink(realWorkspace, aliasWorkspace))

	realPath, err := passthroughMCPFileLockPath(filepath.Join(realWorkspace, ".pi", "mcp.json"))
	require.NoError(t, err)
	aliasPath, err := passthroughMCPFileLockPath(filepath.Join(aliasWorkspace, ".pi", "mcp.json"))
	require.NoError(t, err)

	require.Equal(t, realPath, aliasPath,
		"a symlink alias and its canonical workspace must share the lock")
}

func setPassthroughMCPFileLockCacheDir(t *testing.T, cacheDir string) {
	t.Helper()
	switch runtime.GOOS {
	case "windows":
		t.Setenv("LocalAppData", cacheDir)
	case "plan9":
		t.Setenv("home", cacheDir)
	default:
		t.Setenv("XDG_CACHE_HOME", cacheDir)
	}
}
