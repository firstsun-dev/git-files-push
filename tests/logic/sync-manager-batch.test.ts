import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncManager } from '../../src/logic/sync-manager';
import { App, TFile, Notice } from 'obsidian';
import { GitLabService } from '../../src/services/gitlab-service';
import { GitLabFilesPushSettings } from '../../src/settings';

vi.mock('obsidian');

describe('SyncManager Batch Operations', () => {
    let manager: SyncManager;
    let mockApp: any;
    let mockGitService: any;
    let mockSettings: GitLabFilesPushSettings;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {
            vault: {
                read: vi.fn(),
                modify: vi.fn(),
                getFileByPath: vi.fn(),
                adapter: {
                    exists: vi.fn(),
                    read: vi.fn(),
                    write: vi.fn(),
                }
            },
            workspace: {
                getActiveFile: vi.fn(),
            }
        };

        mockGitService = {
            pushFile: vi.fn(),
            getFile: vi.fn(),
        };

        mockSettings = {
            serviceType: 'github',
            githubToken: 'token',
            githubOwner: 'owner',
            githubRepo: 'repo',
            branch: 'main',
            syncMetadata: {},
        } as any;

        manager = new SyncManager(mockApp as any, mockGitService as any, mockSettings);
        (manager as any).saveSettings = vi.fn();
    });

    describe('pushAllFiles', () => {
        it('should push multiple files correctly', async () => {
            const files = ['file1.md', 'file2.md'];
            
            mockApp.vault.adapter.exists.mockResolvedValue(true);
            mockApp.vault.adapter.read.mockResolvedValue('content');
            mockGitService.getFile.mockResolvedValue({ sha: 'old-sha' });
            mockGitService.pushFile.mockResolvedValue('path');

            const results = await manager.pushAllFiles(files);

            expect(results.success).toBe(2);
            expect(mockGitService.pushFile).toHaveBeenCalledTimes(2);
            expect(mockApp.vault.adapter.read).toHaveBeenCalledWith('file1.md');
            expect(mockApp.vault.adapter.read).toHaveBeenCalledWith('file2.md');
        });

        it('should handle failures during batch push', async () => {
            const files = ['good.md', 'bad.md'];
            
            mockApp.vault.adapter.exists.mockResolvedValue(true);
            mockApp.vault.adapter.read.mockResolvedValue('content');
            mockGitService.getFile.mockResolvedValue({ sha: 'old-sha' });
            
            mockGitService.pushFile
                .mockResolvedValueOnce('path')
                .mockRejectedValueOnce(new Error('Push failed'));

            const results = await manager.pushAllFiles(files);

            expect(results.success).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors[0].file).toBe('bad.md');
        });
    });

    describe('pullAllAllFiles', () => {
        it('should pull multiple files correctly', async () => {
            const files = ['file1.md', 'file2.md'];
            
            mockGitService.getFile.mockResolvedValue({ content: 'remote content', sha: 'new-sha' });
            mockApp.vault.adapter.exists.mockResolvedValue(true);

            const results = await manager.pullAllFiles(files);

            expect(results.success).toBe(2);
            expect(mockApp.vault.adapter.write).toHaveBeenCalledTimes(2);
            expect(mockApp.vault.adapter.write).toHaveBeenCalledWith('file1.md', 'remote content');
        });

        it('should handle missing remote files during batch pull', async () => {
            const files = ['exists.md', 'missing.md'];
            
            mockGitService.getFile
                .mockResolvedValueOnce({ content: 'content', sha: 'sha' })
                .mockResolvedValueOnce({ content: '', sha: '' });

            const results = await manager.pullAllFiles(files);

            expect(results.success).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors[0].error).toContain('File not found in remote');
        });
    });
});
